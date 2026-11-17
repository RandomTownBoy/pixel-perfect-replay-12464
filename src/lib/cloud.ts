import { useEffect, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { startTimer, stopTimer, type TimerHandle } from "@/lib/ticker";
import { supabase } from "@/integrations/supabase/client";
import {
  actions, DEFAULT_INTAKE, getCategories, getQuestions, getSettings, GIMMICKS, hasRemote, isDuplicate, onPersistChange, pushOverlay, readOverlay,
  OUTRO_MS, queueSecondsFor, replaceCategories, replaceQuestions, replaceSettings, sendToOverlay, settleQuestion, setOverlayIntake, setOverlayOutro, setOverlayQueue, setOverlayVisible, setOverlayVotes, setRemote, showBanner, spinPoolOf, subscribeOverlay, VIEWER_CATEGORY,
  type GimmickId, type Intake, type OverlayPayload, type OverlayState, type Question, type Settings, type SpinPayload,
} from "@/lib/kyoka";
import { getLockedDecks, pickViewerDeck } from "@/lib/decks";

/* ---------- auth ---------- */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, loading };
}

/* ---------- live store ---------- */
export type Submission = {
  id: string; kind: string; round_id: string | null; choice: string | null;
  content: string | null; nickname: string | null; status: string; created_at: string;
  source?: string | null; fingerprint?: string | null; verified_uid?: string | null; flagged?: boolean | null; flag_reason?: string | null;
};
export type LiveEvent = {
  id: string; type: string; user_id: string | null; nickname: string | null; content: string | null;
  gift_name: string | null; gift_count: number; diamonds: number; vote_choice: string | null;
  round_id: string | null; created_at: string; handle?: string | null; is_follower?: boolean | null; flagged?: boolean | null; flag_reason?: string | null;
};
type TiktokStatus = { connected: boolean; handle: string; at: number };
export type Gifter = { user_id: string; nickname: string; handle?: string; diamonds: number; gifts: number; lastAt: number };
export type Perk = { id: string; who: string; text: string; at: number; tier: number };
type Tally = { a: number; b: number };
type Live = {
  overlayToken: string | null; audienceCode: string | null; overlayConnected: boolean;
  round: string; web: Tally; tiktok: Tally; gift: Tally; inbox: Submission[]; history: Submission[];
  review: Submission[]; queue: Submission[]; nowShowing: Submission | null; intake: Intake;
  gifters: Record<string, Gifter>; perks: Perk[]; followStats: { known: number; unknown: number };
  ingestKey: string | null; feed: LiveEvent[]; tiktokLive: TiktokStatus;
  giftLog: { id: string; text: string; at: number }[];
  /** Timer antrean overlay sedang ditahan host. */
  queuePaused: boolean;
};
let live: Live = {
  overlayToken: null, audienceCode: null, overlayConnected: false, round: "",
  web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 }, inbox: [], history: [], review: [], queue: [], nowShowing: null, intake: DEFAULT_INTAKE, gifters: {}, perks: [], followStats: { known: 0, unknown: 0 }, giftLog: [], queuePaused: false,
  ingestKey: null, feed: [], tiktokLive: { connected: false, handle: "", at: 0 },
};
const subs = new Set<() => void>();
function setLive(p: Partial<Live>) { live = { ...live, ...p }; subs.forEach((f) => f()); }
export function useLive<T>(sel: (l: Live) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(live), () => sel(live));
}
export const totalVotes = (l: Live): Tally => ({ a: l.web.a + l.tiktok.a + l.gift.a, b: l.web.b + l.tiktok.b + l.gift.b });

let voteTimer: TimerHandle | null = null;
function scheduleVotePush() {
  if (voteTimer) return;
  voteTimer = startTimer(() => { voteTimer = null; setOverlayVotes(totalVotes(live)); }, 400);
}
/** Tujuan bawaan di bagian Gimmick untuk tiap jenis kiriman penonton. */
export const KIND_TO_GIMMICK: Record<string, GimmickId> = {
  confession: "confession", card: "card", hottake: "hottake", spin: "spin", thisorthat: "thisorthat", problem: "chaos", question: "spin",
};
/** Jenis kiriman penonton yang ditampilkan di riwayat tiap gimmick. */
export const GIMMICK_KINDS: Record<GimmickId, string[]> = {
  spin: ["spin", "question"], thisorthat: ["thisorthat"], card: ["card"], hottake: ["hottake"], confession: ["confession"], chaos: ["chaos", "problem"],
};
/** Jumlah maksimal riwayat kiriman yang dimuat (semua jenis digabung). */
export const HISTORY_LIMIT = 300;
/** Batas Inbox (kiriman menunggu) dan daftar "perlu dicek" yang dimuat; dinaikkan supaya antrean panjang saat live ramai tidak terpotong. */
export const INBOX_LIMIT = 500;
export const REVIEW_LIMIT = 200;
/** Jenis kiriman yang masuk antrean tayang di overlay saat gimmick-nya sedang tayang. Spin → roda, Card → bank (isi kartu tetap tersembunyi). */
export const QUEUE_KINDS = new Set(["confession", "hottake", "chaos", "thisorthat"]);
/** Kiriman yang ditahan di Inbox menunggu giliran: bersih, belum antre/tayang, jenis tertentu (Confession, Hot Take, This or That). */
export function waitingOf(l: { inbox: Submission[]; queue: Submission[]; nowShowing: Submission | null }, kind: string): Submission[] {
  return l.inbox.filter((s) => s.kind === kind && s.status === "pending" && !s.flagged && s.id !== l.nowShowing?.id && !l.queue.some((q) => q.id === s.id));
}
/** Urutan putar antrean: VIP (fast track) dulu, sisanya yang paling lama menunggu dulu. */
export const waitingOrder = (list: Submission[]): Submission[] =>
  [...list].sort((a, b) => fastRank(b) - fastRank(a) || Date.parse(a.created_at) - Date.parse(b.created_at));
/** Jenis kiriman yang bisa disimpan ke Question Bank. */
export const BANKABLE_KINDS = new Set(["confession", "card", "hottake", "spin", "thisorthat", "problem", "question"]);

/* ---------- VIP gifter ---------- */
export const TIER_BADGE = ["", "⭐", "💎", "👑"];
export const TIER_NAME = ["", "Supporter", "VIP", "Sultan"];
export function tierFor(diamonds: number): number {
  const [t1, t2, t3] = getSettings().vipTiers;
  if (diamonds <= 0) return 0;
  return diamonds >= t3 ? 3 : diamonds >= t2 ? 2 : diamonds >= t1 ? 1 : 0;
}
export const tierOfUser = (uid: string | null | undefined) => (uid ? tierFor(live.gifters[uid]?.diamonds ?? 0) : 0);
/** Tier VIP pengirim sebuah kiriman: dari komentar TikTok (fingerprint "tt:<id>") atau dari kode verifikasi "!fast KODE" (verified_uid). */
export const vipOf = (s: Submission) =>
  s.fingerprint?.startsWith("tt:") ? tierOfUser(s.fingerprint.slice(3)) : s.verified_uid ? tierOfUser(s.verified_uid) : 0;
/** Kiriman ini lewat jalur fast track (gifter dengan tier cukup). */
export const isFast = (s: Submission) => { const t = getSettings().fastTrackTier; return t > 0 && vipOf(s) >= t; };
/** Peringkat antrean: fast track dulu (tier tertinggi di atas), sisanya menurut waktu. */
export const fastRank = (s: Submission) => (isFast(s) ? vipOf(s) : 0);
const byVipThenNewest = (x: Submission, y: Submission) => fastRank(y) - fastRank(x) || Date.parse(y.created_at) - Date.parse(x.created_at);
export const sortVip = (l: Submission[]) => [...l].sort(byVipThenNewest);

/** Catat gift ke total pengirim. Mengembalikan teks naik-tier dan apakah baru masuk jalur fast track. */
function recordGift(e: LiveEvent): { tierUp?: string; newlyFast: boolean } {
  const uid = e.user_id;
  if (!uid) return { newlyFast: false };
  const prev = live.gifters[uid];
  const add = e.diamonds > 0 ? e.diamonds : Math.max(1, e.gift_count || 1);
  const handle = (e.handle ?? prev?.handle ?? "").toLowerCase();
  const next: Gifter = {
    user_id: uid, nickname: e.nickname || prev?.nickname || uid, ...(handle ? { handle } : {}),
    diamonds: (prev?.diamonds ?? 0) + add, gifts: (prev?.gifts ?? 0) + Math.max(1, e.gift_count || 1), lastAt: Date.now(),
  };
  setLive({ gifters: { ...live.gifters, [uid]: next } });
  const before = tierFor(prev?.diamonds ?? 0);
  const after = tierFor(next.diamonds);
  const ft = getSettings().fastTrackTier;
  return {
    ...(after > before ? { tierUp: `${TIER_BADGE[after]} @${next.nickname} jadi ${TIER_NAME[after]}! (${next.diamonds} 💎)` } : {}),
    newlyFast: ft > 0 && after >= ft && before < ft,
  };
}

/* ---------- antrean banner (notifikasi gift tidak saling menimpa) ---------- */
const bannerQ: string[] = [];
let bannerTimer: TimerHandle | null = null;
function nextBanner() {
  const t = bannerQ.shift();
  if (!t) { bannerTimer = null; return; }
  showBanner(t);
  bannerTimer = startTimer(nextBanner, 4500);
}
function pushBanner(text: string) {
  bannerQ.push(text);
  if (bannerQ.length > 8) bannerQ.shift();
  if (!bannerTimer) nextBanner();
}

/* ---------- antrean overlay ---------- */
let queueTimer: TimerHandle | null = null;
let queueDeadline = 0;
let queueLeft = 0;
let queueMs = 0;
let queueStartedAt = 0;
/**
 * Kirim ke overlay info garis loading antrean. Aktif hanya kalau ada item tayang DAN masih ada yang menunggu;
 * begitu antrean habis (item terakhir) info dihapus sehingga garis berhenti dan tidak mengulang.
 */
function syncQueueOverlay() {
  if (!live.nowShowing || live.queue.length === 0 || !queueMs) {
    if (readOverlay().queue) setOverlayQueue(undefined);
    return;
  }
  setOverlayQueue({ pending: live.queue.length, ms: queueMs, startedAt: queueStartedAt, ...(live.queuePaused ? { pausedAt: Date.now() } : {}) });
}
/** payloadAt overlay milik item antrean yang sedang tayang. Kalau berubah, host mengganti gimmick sendiri. */
let shownAt = 0;
let presenting = false;

/** Gimmick yang sedang tayang (kiriman confession yang tampil dihitung sebagai gimmick Confession). */
export function onAirGimmick(): string | null {
  const p = readOverlay().payload;
  if (p?.gimmick === "audience") return KIND_TO_GIMMICK[p.kind] ?? null;
  return p?.gimmick ?? null;
}
/** Roda (Spin the Question) yang sedang tayang di overlay. Null kalau bukan roda berfase. */
function spinOnAir(): SpinPayload | null {
  const p = readOverlay().payload;
  return p?.gimmick === "spin" && p.phase !== undefined ? p : null;
}
/** Tampilkan satu kiriman di overlay sesuai jenisnya. False kalau isinya tidak valid. */
function present(s: Submission): boolean {
  const text = (s.content ?? "").trim();
  if (!text) return false;
  if (s.kind === "confession") sendToOverlay({ gimmick: "audience", kind: "confession", content: text, ...(s.nickname ? { nickname: s.nickname } : {}) });
  else if (s.kind === "hottake") sendToOverlay({ gimmick: "hottake", topic: text });
  else if (s.kind === "thisorthat") {
    const [a, b] = text.split(" | ");
    if (!a?.trim() || !b?.trim()) return false;
    sendToOverlay({ gimmick: "thisorthat", a: a.trim(), b: b.trim() });
  } else if (s.kind === "chaos") {
    const words = text.split(",").map((w) => w.trim()).filter(Boolean);
    if (words.length !== 3) return false;
    sendToOverlay({ gimmick: "chaos", mode: "story", words });
  } else return false;
  return true;
}
/** Item berikutnya tampil dan bertahan sesuai durasi gimmick-nya. Antrean habis: layar tetap di item terakhir (tidak kembali ke gimmick sebelumnya). */
let outroing = false;
function queueTick(skipOutro = false) {
  queueTimer = null;
  outroing = false;
  const cur = live.nowShowing;
  const ov = readOverlay();
  // Waktu tayang item habis (bukan dilewati manual): mainkan animasi penutup dulu, baru lanjut ke item berikutnya.
  // Hanya kalau overlay memang masih menampilkan item ini (host belum menggantinya) dan overlay tidak disembunyikan.
  if (!skipOutro && cur && ov.visible && ov.payloadAt === shownAt) {
    outroing = true;
    setOverlayOutro({ at: Date.now(), ms: OUTRO_MS, votes: totalVotes(live), fade: live.queue.length === 0 && cur.kind !== "thisorthat" });
    queueTimer = startTimer(() => queueTick(true), OUTRO_MS);
    syncQueueOverlay();
    return;
  }
  const next = live.queue[0];
  if (!next) {
    if (ov.outro?.fade) setOverlayOutro(undefined);
    setLive({ nowShowing: null, queuePaused: false }); syncQueueOverlay(); return;
  }
  setLive({ queue: live.queue.slice(1), nowShowing: next, queuePaused: false });
  presenting = true;
  let ok = false;
  try { ok = present(next); } finally { presenting = false; }
  if (!ok) { void liveActions.setStatus(next.id, "review"); setLive({ nowShowing: null }); queueTick(); return; }
  shownAt = readOverlay().payloadAt;
  void liveActions.setStatus(next.id, "shown");
  const ms = queueSecondsFor(next.kind) * 1000;
  queueDeadline = Date.now() + ms;
  queueMs = ms; queueStartedAt = Date.now();
  queueTimer = startTimer(() => queueTick(), ms);
  syncQueueOverlay();
}
/** Host mengganti gimmick sendiri: sisa antrean tidak dibuang, kembali menunggu di Inbox. */
function abandonQueue() {
  stopTimer(queueTimer); queueTimer = null;
  const rest = live.queue;
  setLive({ queue: [], nowShowing: null, queuePaused: false });
  syncQueueOverlay();
  // Item antre belum berstatus "shown", jadi masih ada di Inbox: cukup dilepas dari antrean, tidak dibuang ke Bank.
  if (rest.length) toast(`${rest.length} kiriman kembali ke daftar tunggu di Inbox`);
}
function watchHostSwitch(o: OverlayState) {
  if (presenting || !live.nowShowing) return;
  if (o.payloadAt !== shownAt) abandonQueue();
}

/** Penyaluran otomatis kiriman bersih: Confession/Hot Take/This or That ditahan di Inbox (antrean hanya ikut kalau sudah berjalan); Spin → roda; Pick a Card → Question Bank kecuali opsi persetujuan manual aktif; sisanya → Question Bank ("Dari Penonton"). */
async function saveRouted(r: Submission, target?: GimmickId, category?: string, toWheel = false) {
  const res = await liveActions.saveToBank(r, target, category);
  if (!res.ok) toast.error(res.message);
  else if (toWheel) toast.success(`🎡 ${r.nickname ? `@${r.nickname}: ` : ""}pertanyaan masuk ke roda`);
}
function routeSubmission(r: Submission) {
  if (r.status !== "pending") return;
  if (r.kind === "spin" || r.kind === "question") {
    const cfg = getSettings();
    const active = getQuestions().filter((q) => q.gimmick === "spin" && q.category === VIEWER_CATEGORY && !q.used).length;
    const waiting = live.inbox.filter((x) => (x.kind === "spin" || x.kind === "question") && x.status === "pending").length;
    if (active + waiting > cfg.spinCapacity) { void liveActions.setStatus(r.id, "rejected"); return; }
    if (cfg.spinModeration === "manual") {
      void liveActions.setStatus(r.id, "review");
      setLive({ review: [r, ...live.review.filter((x) => x.id !== r.id)].slice(0, REVIEW_LIMIT) });
      return;
    }
    if (r.flagged) {
      setLive({ review: [r, ...live.review.filter((x) => x.id !== r.id)].slice(0, REVIEW_LIMIT) });
      void liveActions.setStatus(r.id, "review");
      return;
    }
    const w = spinOnAir();
    void saveRouted(r, "spin", VIEWER_CATEGORY, !!w && spinPoolOf(getQuestions(), VIEWER_CATEGORY, cfg.spinSlices).length < cfg.spinSlices);
    return;
  }
  if (r.flagged) {
    setLive({ review: [r, ...live.review.filter((x) => x.id !== r.id)].slice(0, REVIEW_LIMIT) });
    void liveActions.setStatus(r.id, "review");
    return;
  }
  if (QUEUE_KINDS.has(r.kind)) {
    // Ikut antrean hanya kalau antrean jenis ini SUDAH berjalan (host menekan "Tampilkan antrean"). Selain itu kiriman ditahan di Inbox,
    // tidak tampil sendiri dan tidak dibuang ke Bank, sampai host menekan tombol atau menyimpan/menolaknya.
    if (live.nowShowing?.kind === r.kind && onAirGimmick() === KIND_TO_GIMMICK[r.kind]) liveActions.enqueue(r);
    return;
  }
  // Kartu penonton: otomatis masuk deck penonton ("Penonton #1", "Penonton #2", ...), atau ditahan di Inbox sampai host menyetujui kalau opsinya dimatikan.
  // Isi kartu tersembunyi sampai dibuka, jadi mode tahan berguna kalau host mau menyaring dulu sebelum tayang di stream.
  if (r.kind === "card" && !getSettings().autoApproveCards) return;
  if (BANKABLE_KINDS.has(r.kind)) void saveRouted(r);
}

let cardSaveChain: Promise<void> = Promise.resolve();
async function saveToBankNow(s: Submission, dest: GimmickId, categoryIn: string): Promise<{ ok: boolean; message: string }> {
  let text = (s.content ?? "").trim();
  if (!text) return { ok: false, message: "Isi kosong, tidak bisa disimpan." };
  if (!BANKABLE_KINDS.has(s.kind)) return { ok: false, message: "Jenis kiriman ini tidak disimpan ke Question Bank." };
  if (!ownerId || !hasRemote()) return { ok: false, message: "Belum tersambung ke database. Tunggu sebentar lalu coba lagi." };
  const destName = GIMMICKS.find((g) => g.id === dest)?.name ?? dest;
  if (dest === "thisorthat") text = text.replace(" | ", " || "); // format Question Bank untuk This or That
  const isViewerCard = dest === "card" && categoryIn === VIEWER_CATEGORY;
  const duplicate = isDuplicate(text);
  let category = categoryIn;
  if (!duplicate) {
    if (isViewerCard) category = pickViewerDeck(getQuestions(), getLockedDecks());
    const { error } = await supabase.from("questions").insert({
      id: crypto.randomUUID(), text, gimmick: dest,
      category, favorite: false, used: false, demo: false,
    });
    if (error) {
      console.error("saveToBank gagal", error);
      return { ok: false, message: `Gagal menyimpan ke Question Bank: ${error.message}` };
    }
    if (dest !== "card") actions.addCategory(category);
    await resyncQuestions();
  }
  const marked = await liveActions.setStatus(s.id, "approved");
  if (!marked) return { ok: false, message: "Sudah masuk Question Bank, tapi status inbox gagal diperbarui. Coba tekan lagi." };
  if (isViewerCard) return { ok: true, message: duplicate ? "Isi yang sama sudah ada di Question Bank." : `Kartu masuk deck ${category} ✅` };
  return { ok: true, message: duplicate ? "Isi yang sama sudah ada di Question Bank." : `Tersimpan di Question Bank → ${destName} ✅` };
}

export const liveActions = {
  addTiktok(side: "a" | "b", n: number) {
    setLive({ tiktok: { ...live.tiktok, [side]: Math.max(0, live.tiktok[side] + n) } }); scheduleVotePush();
  },
  addGift(side: "a" | "b", n: number, text: string) {
    setLive({ gift: { ...live.gift, [side]: live.gift[side] + n }, giftLog: [{ id: crypto.randomUUID(), text, at: Date.now() }, ...live.giftLog].slice(0, 20) });
    scheduleVotePush();
  },
  logGift(text: string) { setLive({ giftLog: [{ id: crypto.randomUUID(), text, at: Date.now() }, ...live.giftLog].slice(0, 20) }); },
  resetVotes() { setLive({ web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 } }); scheduleVotePush(); },
  /** Pindahkan kiriman penonton antar status. Mengembalikan false (dan membatalkan perubahan di layar) kalau database gagal. */
  async setStatus(id: string, status: string): Promise<boolean> {
    const before = { inbox: live.inbox, review: live.review, history: live.history };
    const item = [...live.inbox, ...live.review, ...live.history].find((x) => x.id === id);
    if (item) {
      const moved: Submission = { ...item, status };
      const byNewest = (x: Submission, y: Submission) => Date.parse(y.created_at) - Date.parse(x.created_at);
      const without = (l: Submission[]) => l.filter((x) => x.id !== id);
      setLive({
        inbox: status === "pending" ? [moved, ...without(live.inbox)].sort(byNewest).slice(0, INBOX_LIMIT) : without(live.inbox),
        review: status === "review" ? [moved, ...without(live.review)].sort(byNewest).slice(0, REVIEW_LIMIT) : without(live.review),
        history: status !== "pending" && status !== "review" ? [moved, ...without(live.history)].sort(byNewest).slice(0, HISTORY_LIMIT) : without(live.history),
      });
    }
    const { data, error } = await supabase.from("audience_submissions").update({ status }).eq("id", id).select("id");
    if (error || !data?.length) {
      console.error("setStatus gagal", error);
      setLive(before);
      toast.error(error ? `Gagal memperbarui: ${error.message}` : "Gagal memperbarui: data tidak ditemukan atau tidak ada izin.");
      return false;
    }
    return true;
  },
  /**
   * Hapus permanen kiriman dari riwayat (satu atau banyak). Hanya status yang sudah selesai (approved/shown/rejected) yang boleh dihapus,
   * supaya kiriman yang masih menunggu di Inbox tidak hilang tak sengaja. Isi yang sudah masuk Question Bank tidak ikut terhapus.
   * Tampilan diperbarui lebih dulu dan dikembalikan kalau database gagal.
   */
  async deleteHistory(ids: string[]): Promise<boolean> {
    const set = new Set(ids);
    const targets = live.history.filter((x) => set.has(x.id)).map((x) => x.id);
    if (!targets.length) return true;
    const before = live.history;
    setLive({ history: live.history.filter((x) => !set.has(x.id)) });
    const { error } = await supabase.from("audience_submissions").delete().in("id", targets).in("status", ["approved", "shown", "rejected"]);
    if (error) {
      console.error("deleteHistory gagal", error);
      setLive({ history: before });
      toast.error(`Gagal menghapus riwayat: ${error.message}`);
      return false;
    }
    toast.success(targets.length === 1 ? "Riwayat dihapus" : `${targets.length} riwayat dihapus`);
    return true;
  },
  /** Masukkan kiriman ke antrean overlay. Tiap item tampil sesuai durasi gimmick-nya (Confession 3 mnt, Hot Take/Chaos 2 mnt, This or That 1,5 mnt). */
  enqueue(s: Submission) {
    if (!QUEUE_KINDS.has(s.kind) || s.flagged || s.status === "review") return false;
    if (live.queue.some((x) => x.id === s.id) || live.nowShowing?.id === s.id) return false;
    setLive({ queue: [...live.queue, s] });
    if (!queueTimer && !live.nowShowing) queueTick(); else syncQueueOverlay();
    return true;
  },
  /** ▶ Putar semua kiriman yang menunggu untuk satu jenis (VIP dulu, lalu yang paling lama menunggu). Antrean jenis lain yang sedang jalan dihentikan. */
  playWaiting(kind: string): number {
    if (!QUEUE_KINDS.has(kind)) return 0;
    const list = waitingOrder(waitingOf(live, kind));
    if (!list.length) { toast("Tidak ada kiriman yang menunggu."); return 0; }
    if (live.nowShowing && live.nowShowing.kind !== kind) {
      stopTimer(queueTimer); queueTimer = null;
      setLive({ queue: [], nowShowing: null, queuePaused: false });
    }
    setLive({ queue: [...live.queue, ...list] });
    if (!queueTimer && !live.nowShowing) queueTick(); else syncQueueOverlay();
    toast.success(`▶ ${list.length} kiriman diputar berurutan`);
    return list.length;
  },
  /** Tampilkan satu kiriman sekarang juga, terpisah dari antrean (kalau antrean sedang jalan, antrean berhenti dan sisanya kembali menunggu). */
  showNow(s: Submission): boolean {
    if (!QUEUE_KINDS.has(s.kind)) return false;
    if (!present(s)) { toast.error("Isi kiriman tidak valid untuk ditampilkan."); return false; }
    void liveActions.setStatus(s.id, "shown");
    return true;
  },
  /** ⏸️ Tahan: bekukan timer item yang sedang tampil. */
  pauseQueue() {
    if (!queueTimer || outroing) return;
    stopTimer(queueTimer); queueTimer = null;
    queueLeft = Math.max(1000, queueDeadline - Date.now());
    setLive({ queuePaused: true });
    syncQueueOverlay();
  },
  /** ▶️ Lanjutkan timer yang ditahan. */
  resumeQueue() {
    if (!live.queuePaused) return;
    setLive({ queuePaused: false });
    queueDeadline = Date.now() + queueLeft;
    queueTimer = startTimer(() => queueTick(), queueLeft);
    queueStartedAt = Date.now() - (queueMs - queueLeft);
    syncQueueOverlay();
  },
  /** Untuk uji: apakah penguji dianggap follower. */
  setTestFollower(v: boolean) { testFollower = v; },
  donePerk(id: string) { setLive({ perks: live.perks.filter((x) => x.id !== id) }); },
  /** Mulai hitung VIP dari nol (mis. setiap awal live). */
  resetVip() { actions.updateSettings({ vipSince: Date.now() }); setLive({ gifters: {}, perks: [] }); },
  topGifters(n = 5): Gifter[] { return Object.values(live.gifters).sort((a, b) => b.diamonds - a.diamonds).slice(0, n); },
  /** Tampilkan Top Gifter sebagai banner (tidak mengganggu ronde/vote yang sedang jalan). */
  showLeaderboard() {
    const top = liveActions.topGifters(5);
    if (!top.length) { toast("Belum ada gifter di sesi ini."); return; }
    showBanner(`🏆 Top Gifter: ${top.map((g, i) => `${i + 1}. ${TIER_BADGE[tierFor(g.diamonds)]} @${g.nickname} ${g.diamonds}💎`).join("  ·  ")}`);
  },
  /** Tombol panik: sembunyikan overlay seketika, kosongkan antrean dan banner. Kiriman di Inbox tetap aman. */
  panic() {
    stopTimer(queueTimer); queueTimer = null;
    stopTimer(bannerTimer); bannerTimer = null; bannerQ.length = 0;
    setLive({ queue: [], nowShowing: null, queuePaused: false });
    const o = { ...readOverlay() };
    delete o.banner; delete o.queue; delete o.outro;
    pushOverlay({ ...o, visible: false });
    actions.log("🚨 Panik: overlay disembunyikan dan antrean dikosongkan");
  },
  unpanic() { setOverlayVisible(true); },
  /** ⏭️ Lanjut: langsung ke item berikutnya tanpa menunggu waktu habis. */
  skipQueue() { stopTimer(queueTimer); queueTimer = null; queueTick(true); },
  clearQueue() { stopTimer(queueTimer); queueTimer = null; setLive({ queue: [] }); queueTick(true); },
  /** Jadikan kiriman penonton sebagai ronde/cerita (This or That, Hot Take, Random Chaos). Mengganti tampilan overlay. */
  startRound(s: Submission): boolean {
    const text = (s.content ?? "").trim();
    if (!text || s.flagged || s.status === "review") return false;
    if (s.kind === "thisorthat") {
      const [a, b] = text.split(" | ");
      if (!a || !b) return false;
      sendToOverlay({ gimmick: "thisorthat", a: a.trim(), b: b.trim() });
    } else if (s.kind === "hottake") {
      sendToOverlay({ gimmick: "hottake", topic: text });
    } else if (s.kind === "chaos") {
      const words = text.split(",").map((w) => w.trim()).filter(Boolean);
      if (words.length !== 3) return false;
      sendToOverlay({ gimmick: "chaos", mode: "story", words });
    } else return false;
    void liveActions.setStatus(s.id, "shown");
    return true;
  },
  async setIntake(key: keyof Intake, value: boolean) {
    const prev = live.intake;
    const next = { ...prev, [key]: value };
    setLive({ intake: next });
    setOverlayIntake(next);
    if (!ownerId) return;
    const { error } = await supabase.from("studio_sessions").update({ intake: next as never }).eq("owner_id", ownerId);
    if (error) {
      console.error("setIntake gagal", error);
      setLive({ intake: prev });
      setOverlayIntake(prev);
      toast.error("Gagal mengubah jendela input. Pastikan migrasi paket 1 sudah dijalankan.");
      return;
    }
    sendAudience();
  },
  /** Simpan isi kiriman penonton ke Question Bank, lalu tandai sebagai "approved". */
  async saveToBank(s: Submission, target?: GimmickId, category: string = VIEWER_CATEGORY): Promise<{ ok: boolean; message: string }> {
    const dest: GimmickId = target ?? KIND_TO_GIMMICK[s.kind] ?? "spin";
    // Kartu penonton memilih deck sendiri. Penyimpanan kartu diantrekan satu per satu supaya dua kiriman yang masuk bersamaan
    // tidak sama-sama mengisi deck yang tinggal satu slot.
    if (dest === "card" && category === VIEWER_CATEGORY) {
      const run = cardSaveChain.then(() => saveToBankNow(s, dest, category));
      cardSaveChain = run.then(() => undefined, () => undefined);
      return run;
    }
    return saveToBankNow(s, dest, category);
  },
  async rotateIngestKey() {
    const { data, error } = await supabase.rpc("rotate_ingest_key");
    if (error || !data) { toast.error("Gagal mengganti kunci konektor."); return false; }
    setLive({ ingestKey: data as string });
    return true;
  },
  clearFeed() { setLive({ feed: [] }); },
  /** Kirim event palsu lewat jalur yang sama dengan konektor TikTok, untuk menguji alur tanpa live. */
  async sendTestEvent(kind: "comment-a" | "comment-b" | "comment" | "spin" | "gift" | "gift-big" | "follow" | "custom", text?: string) {
    if (!live.ingestKey) { toast.error("Kunci konektor belum siap."); return false; }
    const newUser = () => `test-${Math.random().toString(36).slice(2, 8)}`;
    if (kind === "comment-a" || kind === "comment-b") testUser = newUser();
    const user = kind === "comment" || kind === "follow" ? newUser() : testUser; // spin & gift memakai penguji yang sama agar VIP bisa dicoba
    const ev: Record<string, unknown> =
      kind === "comment-a" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "A" } :
      kind === "comment-b" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "B" } :
      kind === "comment" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "Halo Kyoka, tes komentar!" } :
      kind === "spin" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "!spin Makanan apa yang bikin kamu kangen rumah?" } :
      kind === "custom" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: (text ?? "").slice(0, 300) } :
      kind === "gift-big" ? { type: "gift", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", gift_name: "Galaxy", gift_count: 1, diamonds: 1500 } :
      kind === "gift" ? { type: "gift", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", gift_name: getSettings().giftRules[0]?.name ?? "Rose", gift_count: 1, diamonds: 1 } :
      { type: "follow", user_id: user, nickname: "penonton_uji", handle: "penonton_uji" };
    ev["is_follower"] = testFollower;
    const { error } = await supabase.rpc("ingest_live_events", { _key: live.ingestKey, _events: [ev] as never });
    if (error) { toast.error(`Event uji gagal: ${error.message}`); return false; }
    return true;
  },
  async rotateToken() {
    const { data, error } = await supabase.rpc("rotate_overlay_token");
    if (!error && data) { setLive({ overlayToken: data }); connectChannels(); }
    return !error;
  },
};

/* ---------- audience view derived from overlay ---------- */
function audienceStateFor(o: OverlayState) {
  const p = o.payload;
  const round = String(o.payloadAt || "");
  const base = { live: o.visible, round };
  if (!p) return { ...base, mode: "idle" };
  const base2 = { ...base, gimmick: p.gimmick };
  switch (p.gimmick) {
    case "thisorthat": return { ...base2, mode: "vote", a: p.a, b: p.b, title: "This or That" };
    case "hottake": return { ...base2, mode: "vote", a: "Setuju 👍", b: "Gak setuju 👎", title: p.topic };
    case "confession": return { ...base2, mode: "confession", title: p.prompt };
    case "chaos": return p.mode === "solution" ? { ...base2, mode: "problem", title: p.problem } : { ...base2, mode: "question", title: "Random Story: " + p.words.join(", ") };
    case "spin": return { ...base2, mode: "question", title: p.question ?? "Spin the Question" };
    case "card": return { ...base2, mode: "question", title: p.text ?? "Pick a Card" };
    default: return { ...base2, mode: "question", title: "Kirim pertanyaan buat Kyoka" };
  }
}

/* ---------- channels ---------- */
let overlayCh: RealtimeChannel | null = null;
let audienceCh: RealtimeChannel | null = null;
let dbTimer: TimerHandle | null = null;
let ownerId: string | null = null;
let testUser = "test-awal";
let testFollower = true;
/** Siapa memilih sisi apa di ronde aktif (dari komentar A/B) — dipakai supaya gift mendukung sisi pilihannya. */
const userSide = new Map<string, "a" | "b">();

function connectChannels() {
  if (overlayCh) supabase.removeChannel(overlayCh);
  if (audienceCh) supabase.removeChannel(audienceCh);
  if (!live.overlayToken || !live.audienceCode) return;
  overlayCh = supabase.channel(`overlay-${live.overlayToken}`, { config: { presence: { key: "dashboard" } } });
  overlayCh.on("presence", { event: "sync" }, () => {
    const st = overlayCh!.presenceState();
    setLive({ overlayConnected: Object.keys(st).some((k) => k !== "dashboard") });
  }).subscribe();
  audienceCh = supabase.channel(`audience-${live.audienceCode}`).subscribe();
}

function pushRemote(s: OverlayState) {
  const withCode: OverlayState = { ...s, audienceCode: live.audienceCode ?? undefined };
  const round = String(s.payloadAt || "");
  if (round !== live.round) { userSide.clear(); setLive({ round, web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 } }); }
  overlayCh?.send({ type: "broadcast", event: "state", payload: withCode });
  const aud = audienceStateFor(s);
  audienceCh?.send({ type: "broadcast", event: "state", payload: { ...aud, intake: live.intake } });
  stopTimer(dbTimer);
  dbTimer = startTimer(() => {
    if (!ownerId) return;
    supabase.from("studio_sessions").update({ overlay_state: withCode as never, audience_state: aud as never, updated_at: new Date().toISOString() }).eq("owner_id", ownerId).then();
  }, 600);
}

function sendAudience() {
  audienceCh?.send({ type: "broadcast", event: "state", payload: { ...audienceStateFor(readOverlay()), intake: live.intake } });
}

type Row = { id: string; text: string; gimmick: string; category: string; favorite: boolean; used: boolean; demo: boolean; created_at: string };
const toQ = (r: Row): Question => ({ id: r.id, text: r.text, gimmick: r.gimmick as GimmickId, category: r.category, favorite: r.favorite, used: r.used, demo: r.demo, createdAt: Date.parse(r.created_at) });

/** Muat ulang Question Bank. Permintaan yang datang saat pemuatan sedang jalan digabung jadi satu pemuatan lanjutan (kiriman penonton beruntun tidak menumpuk). */
let resyncP: Promise<void> | null = null;
let resyncAgain = false;
function resyncQuestions(): Promise<void> {
  if (resyncP) { resyncAgain = true; return resyncP; }
  resyncP = (async () => {
    do {
      resyncAgain = false;
      const { data, error } = await supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(1000);
      if (!error && data) replaceQuestions((data as Row[]).map(toQ));
    } while (resyncAgain);
  })().finally(() => { resyncP = null; });
  return resyncP;
}

/** Hitung ulang vote web untuk ronde aktif dari database (supaya tidak 0 setelah refresh). */
async function reloadWebTally() {
  const round = live.round;
  if (!round) return;
  const count = (choice: "a" | "b") => supabase.from("audience_submissions").select("id", { count: "exact", head: true })
    .eq("kind", "vote").eq("round_id", round).eq("choice", choice);
  const [a, b] = await Promise.all([count("a"), count("b")]);
  if (a.error || b.error || round !== live.round) return;
  setLive({ web: { a: a.count ?? 0, b: b.count ?? 0 } });
  // Vote dari komentar TikTok (tabel live_events; diam-diam dilewati kalau tabelnya belum ada).
  const { data: cv, error: cerr } = await supabase.from("live_events").select("user_id, vote_choice").eq("round_id", round).not("vote_choice", "is", null).limit(5000);
  if (!cerr && cv && round === live.round) {
    userSide.clear();
    const t = { a: 0, b: 0 };
    for (const r of cv as { user_id: string | null; vote_choice: string | null }[]) {
      if (r.vote_choice !== "a" && r.vote_choice !== "b") continue;
      t[r.vote_choice]++;
      if (r.user_id) userSide.set(r.user_id, r.vote_choice);
    }
    if (live.tiktok.a === 0 && live.tiktok.b === 0) setLive({ tiktok: t });
  }
  scheduleVotePush();
}

const normName = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function matchGiftRule(name: string | null) {
  const n = normName(name ?? "");
  if (!n) return undefined;
  return getSettings().giftRules.find((r) => normName(r.name) === n);
}

/** Id komentar yang sudah dihitung sebagai vote (mencegah hitung ganda kalau event datang dua kali). */
const countedVotes = new Set<string>();
const AGREE = new Set(["setuju", "sepakat", "iya", "ya", "yes", "agree", "👍"]);
const DISAGREE = new Set(["tidak", "tidaksetuju", "gaksetuju", "gak", "ga", "nggak", "enggak", "engga", "tdk", "no", "disagree", "👎"]);
/** Pilihan vote dari isi komentar untuk gimmick yang tayang (This or That: A/B, Hot Take: setuju/tidak). */
function parseVote(text: string | null, gimmick: string): "a" | "b" | null {
  const t = (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]/gu, "");
  if (gimmick === "thisorthat") { const m = /^(?:pilih)?([ab])$/.exec(t); return m ? (m[1] as "a" | "b") : null; }
  if (gimmick === "hottake") return AGREE.has(t) ? "a" : DISAGREE.has(t) ? "b" : null;
  return null;
}
/** Sisi yang harus dihitung untuk komentar ini, atau null (bukan vote / bukan saat gimmick vote / sudah memilih / ditolak filter). */
function voteOf(e: LiveEvent): "a" | "b" | null {
  const o = readOverlay();
  const g = o.payload?.gimmick;
  if (!o.visible || (g !== "thisorthat" && g !== "hottake")) return null;
  if (e.flagged || countedVotes.has(e.id)) return null;
  if (e.user_id && userSide.has(e.user_id)) return null;
  if (e.vote_choice === "a" || e.vote_choice === "b") return e.vote_choice;
  if (live.intake.followersOnly && e.is_follower !== true) return null;
  return parseVote(e.content, g);
}

/** Proses satu event dari konektor TikTok (komentar, gift, follow, share, status koneksi). */
const handledSpinEventIds = new Set<string>();
function handleLiveEvent(e: LiveEvent) {
  if (e.type === "system") {
    const [kind = "", handle = ""] = (e.content ?? "").split(":");
    setLive({ tiktokLive: { connected: kind !== "disconnected", handle, at: Date.now() } });
    return;
  }
  if (e.type === "join" || e.type === "like") return; // terlalu ramai untuk ditampilkan
  if (e.type === "comment") {
    // Hitung berapa komentar yang status follower-nya terbaca (untuk peringatan di opsi "hanya follower").
    const known = e.is_follower === true || e.is_follower === false;
    setLive({ followStats: { known: live.followStats.known + (known ? 1 : 0), unknown: live.followStats.unknown + (known ? 0 : 1) } });
    const match = (e.content ?? "").trim().match(/^!spin\s+(.+)$/i);
    if (match && live.intake.spin && (!live.intake.followersOnly || e.is_follower === true) && ownerId) {
      if (handledSpinEventIds.has(e.id)) return;
      handledSpinEventIds.add(e.id);
      if (handledSpinEventIds.size > 5000) handledSpinEventIds.clear();
      const question = match[1]!.trim().slice(0, 280);
      if (question.length >= 3) {
        void supabase.from("audience_submissions").insert({ owner_id: ownerId, kind: "question", content: question, nickname: e.nickname, source: "tiktok", fingerprint: e.user_id ? `tt:${e.user_id}` : null, status: "pending" } as never).then(({ error }) => {
          if (error) { console.error("Kiriman !spin gagal disimpan", error); toast.error("Kiriman !spin gagal diproses. Periksa kapasitas atau koneksi database."); }
        });
      }
      return;
    }
  }
  // Vote dari komentar. Dipercaya dari tanda vote_choice database kalau ada; kalau tidak ada (atau round_id tidak cocok),
  // isi komentar dibaca di sini (A/B, setuju/tidak) selama gimmick vote sedang tayang. Satu penonton = satu suara per ronde.
  const counted = e.type === "comment" ? voteOf(e) : null;
  const shown: LiveEvent = counted && !e.vote_choice ? { ...e, vote_choice: counted } : e;
  setLive({ feed: [shown, ...live.feed.filter((x) => x.id !== e.id)].slice(0, 60) });
  const who = `@${e.nickname || e.user_id || "penonton"}`;
  if (counted) {
    if (countedVotes.size > 3000) countedVotes.clear();
    countedVotes.add(e.id);
    if (e.user_id) userSide.set(e.user_id, counted);
    liveActions.addTiktok(counted, 1);
    return;
  }
  if (e.type !== "gift") return;
  const { tierUp, newlyFast } = recordGift(e);
  const st = getSettings();
  const extra = [tierUp, newlyFast ? "⚡ Fast track aktif!" : undefined].filter(Boolean).join("  ·  ");
  const tail = extra ? `  ·  ${extra}` : "";
  const notify = (text: string) => { if (st.giftNotify) pushBanner(text); };
  const rule = matchGiftRule(e.gift_name);
  const count = Math.max(1, e.gift_count || 1);
  const p = readOverlay().payload;
  const voting = p?.gimmick === "thisorthat" || p?.gimmick === "hottake";
  if (!rule) { liveActions.logGift(`🎁 ${who} kirim ${e.gift_name ?? "gift"} ×${count}`); notify(`🎁 ${who} kirim ${e.gift_name ?? "gift"}${count > 1 ? ` ×${count}` : ""}!${tail}`); return; }
  if (rule.effect === "vote" && voting) {
    const side = e.user_id ? userSide.get(e.user_id) : undefined;
    if (side) {
      const w = rule.weight * count;
      liveActions.addGift(side, w, `${rule.emoji} ${who} → ${side.toUpperCase()} +${w}`);
      notify(`${rule.emoji} ${who} kirim ${rule.name}! ${side.toUpperCase()} +${w} suara${tail}`);
    } else {
      liveActions.logGift(`${rule.emoji} ${who} kirim ${rule.name} — belum pilih A/B lewat komentar, suara tidak dihitung`);
      notify(`${rule.emoji} ${who} kirim ${rule.name}!${tail}`);
    }
    return;
  }
  liveActions.logGift(`${rule.emoji} ${who}: ${rule.reward}`);
  if (rule.effect === "shoutout") {
    setLive({ perks: [{ id: crypto.randomUUID(), who, text: `${rule.emoji} ${rule.name}: ${rule.reward}`, at: Date.now(), tier: tierOfUser(e.user_id) }, ...live.perks].slice(0, 20) });
  }
  notify(`${rule.emoji} Makasih ${who} untuk ${rule.name}! ${rule.reward}${tail}`);
}

let settingsSync = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistSettingsNow(userId: string) {
  const st = getSettings();
  const payload = { ...st, banned_words: st.bannedWords, categories: getCategories() };
  supabase.from("studio_sessions").update({ settings: payload as never }).eq("owner_id", userId)
    .then(({ error }) => { if (error) { console.error("Simpan pengaturan gagal", error); toast.error("Pengaturan gagal disimpan ke database."); } });
}

function dbFailed(what: string, error: { message: string }) {
  console.error(what, error);
  toast.error(`${what} gagal disimpan ke database. Memuat ulang data…`);
  void resyncQuestions();
}

/** Mount once inside the signed-in area: loads data and wires realtime. */
export function useCloudSync(userId: string | undefined) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!userId) return;
    ownerId = userId;
    let cancelled = false;
    (async () => { try {
      // Kolom dasar dimuat dulu (link penonton + token overlay) supaya tidak ikut gagal kalau kolom baru belum ada di database.
      let { data: sess, error: sessErr } = await supabase.from("studio_sessions").select("overlay_token, audience_code").eq("owner_id", userId).maybeSingle();
      if (sessErr) console.error("Gagal memuat sesi studio", sessErr);
      if (!sess && !sessErr) {
        const ins = await supabase.from("studio_sessions").insert({ owner_id: userId }).select("overlay_token, audience_code").single();
        if (ins.error) console.error("Gagal membuat sesi studio", ins.error);
        sess = ins.data;
      }
      // Kunci konektor TikTok dimuat terpisah; null kalau migrasi database step 2 belum dijalankan.
      const ik = await supabase.from("studio_sessions").select("ingest_key").eq("owner_id", userId).maybeSingle();
      const ingestKey = ik.error ? null : ((ik.data as unknown as { ingest_key?: string } | null)?.ingest_key ?? null);
      const { data: qs } = await supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(1000);
      const { data: inbox } = await supabase.from("audience_submissions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(INBOX_LIMIT);
      const { data: rev } = await supabase.from("audience_submissions").select("*").eq("status", "review").order("created_at", { ascending: false }).limit(REVIEW_LIMIT);
      // Pengaturan + jendela input (kolom baru paket 1); dilewati kalau migrasinya belum jalan.
      const cfg = await supabase.from("studio_sessions").select("settings, intake").eq("owner_id", userId).maybeSingle();
      const cfgRow = cfg.error ? null : (cfg.data as unknown as { settings?: Record<string, unknown> | null; intake?: Partial<Intake> | null } | null);
      const { data: hist } = await supabase.from("audience_submissions").select("*").in("status", ["approved", "shown", "rejected"]).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      const { data: evs } = await supabase.from("live_events").select("*").order("created_at", { ascending: false }).limit(80);
      if (cancelled) return;
      const events = (evs ?? []) as unknown as LiveEvent[];
      const sys = events.find((x) => x.type === "system");
      const sysAt = sys ? Date.parse(sys.created_at) : 0;
      if (sys && Date.now() - sysAt < 60_000) {
        const [kind = "", handle = ""] = (sys.content ?? "").split(":");
        setLive({ tiktokLive: { connected: kind !== "disconnected", handle, at: sysAt } });
      }
      setLive({ feed: events.filter((x) => x.type !== "system" && x.type !== "join" && x.type !== "like").slice(0, 60) });
      replaceQuestions((qs ?? []).map(toQ));
      // Terapkan pengaturan dari database; kalau masih kosong, unggah pengaturan lokal sebagai awal.
      settingsSync = !!cfgRow;
      const dbSettings = cfgRow?.settings ?? {};
      if (Object.keys(dbSettings).length > 0) {
        const { categories, banned_words, ...rest } = dbSettings as Record<string, unknown>;
        replaceSettings({ ...(rest as Partial<Settings>), bannedWords: Array.isArray(banned_words) ? (banned_words as string[]) : ((rest as Partial<Settings>).bannedWords ?? []) });
        if (Array.isArray(categories)) replaceCategories(categories as string[]);
      } else if (settingsSync) persistSettingsNow(userId);
      const intake: Intake = { ...DEFAULT_INTAKE, ...(cfgRow?.intake ?? {}) };
      // Hitung ulang VIP dari gift 12 jam terakhir (atau sejak reset VIP terakhir).
      const since = Math.max(Date.now() - 12 * 3600_000, getSettings().vipSince || 0);
      const sinceIso = new Date(since).toISOString();
      let gres = await supabase.from("live_events").select("user_id, nickname, handle, diamonds, gift_count, created_at").eq("type", "gift").gte("created_at", sinceIso).limit(2000);
      if (gres.error) gres = await supabase.from("live_events").select("user_id, nickname, diamonds, gift_count, created_at").eq("type", "gift").gte("created_at", sinceIso).limit(2000) as typeof gres; // kolom handle (paket 4) belum ada
      const gifters: Record<string, Gifter> = {};
      for (const r of (gres.data ?? []) as unknown as { user_id: string | null; nickname: string | null; handle?: string | null; diamonds: number; gift_count: number; created_at: string }[]) {
        if (!r.user_id) continue;
        const g = gifters[r.user_id] ?? { user_id: r.user_id, nickname: r.nickname || r.user_id, diamonds: 0, gifts: 0, lastAt: 0 };
        if (r.handle) g.handle = r.handle.toLowerCase();
        g.diamonds += r.diamonds > 0 ? r.diamonds : Math.max(1, r.gift_count || 1);
        g.gifts += Math.max(1, r.gift_count || 1);
        g.lastAt = Math.max(g.lastAt, Date.parse(r.created_at));
        if (r.nickname) g.nickname = r.nickname;
        gifters[r.user_id] = g;
      }
      setLive({
        overlayToken: sess?.overlay_token ?? null, audienceCode: sess?.audience_code ?? null, ingestKey, intake, gifters,
        inbox: (inbox ?? []) as unknown as Submission[], review: (rev ?? []) as unknown as Submission[], history: (hist ?? []) as unknown as Submission[],
        round: String(readOverlay().payloadAt || ""),
      });
      void supabase.rpc("purge_my_old_inputs").then(({ error }) => { if (error) console.warn("purge_my_old_inputs", error.message); });
      void reloadWebTally();
      setRemote({
        insert: (rows) => {
          supabase.from("questions").insert(rows.map((q) => ({ id: q.id, text: q.text, gimmick: q.gimmick, category: q.category, favorite: q.favorite, used: q.used, demo: !!q.demo })))
            .then(({ error }) => { if (error) dbFailed("Konten baru", error); });
        },
        update: (id, p) => {
          const patch: { text?: string; category?: string; favorite?: boolean; used?: boolean; gimmick?: string } = {};
          for (const k of ["text", "category", "favorite", "used", "gimmick"] as const) if (k in p) (patch as Record<string, unknown>)[k] = p[k];
          supabase.from("questions").update(patch).eq("id", id).select("id")
            .then(({ data, error }) => { if (error || !data?.length) { settleQuestion(id); dbFailed("Perubahan", error ?? { message: "tidak ada baris yang diubah" }); } });
        },
        remove: (id) => {
          supabase.from("questions").delete().eq("id", id).then(({ error }) => { if (error) { settleQuestion(id); dbFailed("Penghapusan", error); } });
        },
        overlay: pushRemote,
      });
      connectChannels();
      setOverlayIntake(intake);
    } catch (e) { console.error("sync failed", e); } finally { if (!cancelled) setReady(true); } })();
    const ch = supabase.channel(`subs-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audience_submissions", filter: `owner_id=eq.${userId}` }, (e) => {
        const r = e.new as Submission;
        if (r.kind === "vote") {
          if (r.round_id === live.round && (r.choice === "a" || r.choice === "b")) {
            setLive({ web: { ...live.web, [r.choice]: live.web[r.choice] + 1 } }); scheduleVotePush();
          }
        } else if (r.status === "pending") {
          setLive({ inbox: sortVip([r, ...live.inbox]).slice(0, INBOX_LIMIT) });
          // Penyaluran otomatis: cocok dengan gimmick tayang → antre; selain itu → Question Bank. Yang kena moderasi (review) tidak pernah lewat sini.
          routeSubmission(r);
        } else if (r.status === "review") setLive({ review: [r, ...live.review].slice(0, REVIEW_LIMIT) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "audience_submissions", filter: `owner_id=eq.${userId}` }, (e) => {
        const r = e.new as Submission;
        if (!r.verified_uid) return;
        // Tanda verifikasi lama (!fast) dari database: hanya memperbarui lencana di daftar.
        const patch = (l: Submission[]) => l.map((x) => (x.id === r.id ? { ...x, verified_uid: r.verified_uid ?? null } : x));
        setLive({ inbox: sortVip(patch(live.inbox)), review: patch(live.review), history: patch(live.history), queue: patch(live.queue) });
      }).subscribe();
    // Channel terpisah: kalau tabel live_events belum ada, inbox penonton tetap jalan.
    const evCh = supabase.channel(`events-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_events", filter: `owner_id=eq.${userId}` }, (e) => handleLiveEvent(e.new as LiveEvent))
      .subscribe();
    // Question Bank tidak punya pembaruan realtime, jadi perubahan dari tab/perangkat lain diambil saat dashboard kembali difokuskan dan berkala.
    const refreshBank = () => { if (ownerId && document.visibilityState === "visible") void resyncQuestions(); };
    document.addEventListener("visibilitychange", refreshBank);
    window.addEventListener("focus", refreshBank);
    const bankTimer = startTimer(refreshBank, 30_000, true);
    const offHostSwitch = subscribeOverlay(watchHostSwitch);
    // Simpan perubahan pengaturan/kategori ke database (ditunda 1 detik agar tidak menulis setiap ketikan).
    const offPersist = onPersistChange(() => {
      if (!settingsSync) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => persistSettingsNow(userId), 1000);
    });
    // Koneksi dianggap putus kalau konektor tidak mengirim heartbeat selama 60 detik.
    const staleTimer = startTimer(() => {
      if (live.tiktokLive.connected && Date.now() - live.tiktokLive.at > 60_000) setLive({ tiktokLive: { ...live.tiktokLive, connected: false } });
    }, 10_000, true);
    return () => {
      cancelled = true; setRemote(null); document.removeEventListener("visibilitychange", refreshBank); window.removeEventListener("focus", refreshBank); stopTimer(bankTimer); supabase.removeChannel(ch); supabase.removeChannel(evCh); stopTimer(staleTimer); offPersist(); offHostSwitch(); if (persistTimer) clearTimeout(persistTimer); stopTimer(queueTimer); stopTimer(bannerTimer); stopTimer(voteTimer); voteTimer = null; bannerTimer = null; bannerQ.length = 0;
      if (overlayCh) supabase.removeChannel(overlayCh);
      if (audienceCh) supabase.removeChannel(audienceCh);
      overlayCh = audienceCh = null;
    };
  }, [userId]);
  return ready;
}

export type { OverlayPayload };

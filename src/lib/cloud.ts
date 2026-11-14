import { useEffect, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  actions, DEFAULT_INTAKE, getCategories, getSettings, GIMMICKS, hasRemote, isDuplicate, onPersistChange, pushOverlay, readOverlay,
  replaceCategories, replaceQuestions, replaceSettings, sendToOverlay, setOverlayIntake, setOverlayVotes, setRemote, showBanner, VIEWER_CATEGORY,
  type GimmickId, type Intake, type OverlayPayload, type OverlayState, type Question, type Settings,
} from "@/lib/kyoka";

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
  source?: string | null; fingerprint?: string | null; tiktok_user?: string | null; flagged?: boolean | null; flag_reason?: string | null;
};
export type LiveEvent = {
  id: string; type: string; user_id: string | null; nickname: string | null; content: string | null;
  gift_name: string | null; gift_count: number; diamonds: number; vote_choice: string | null;
  round_id: string | null; created_at: string; handle?: string | null; flagged?: boolean | null; flag_reason?: string | null;
};
type TiktokStatus = { connected: boolean; handle: string; at: number };
export type Gifter = { user_id: string; nickname: string; handle?: string; diamonds: number; gifts: number; lastAt: number };
export type Perk = { id: string; who: string; text: string; at: number; tier: number };
type Tally = { a: number; b: number };
type Live = {
  overlayToken: string | null; audienceCode: string | null; overlayConnected: boolean;
  round: string; web: Tally; tiktok: Tally; gift: Tally; inbox: Submission[]; history: Submission[];
  review: Submission[]; queue: Submission[]; nowShowing: Submission | null; intake: Intake;
  gifters: Record<string, Gifter>; perks: Perk[];
  ingestKey: string | null; feed: LiveEvent[]; tiktokLive: TiktokStatus;
  giftLog: { id: string; text: string; at: number }[];
};
let live: Live = {
  overlayToken: null, audienceCode: null, overlayConnected: false, round: "",
  web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 }, inbox: [], history: [], review: [], queue: [], nowShowing: null, intake: DEFAULT_INTAKE, gifters: {}, perks: [], giftLog: [],
  ingestKey: null, feed: [], tiktokLive: { connected: false, handle: "", at: 0 },
};
const subs = new Set<() => void>();
function setLive(p: Partial<Live>) { live = { ...live, ...p }; subs.forEach((f) => f()); }
export function useLive<T>(sel: (l: Live) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(live), () => sel(live));
}
export const totalVotes = (l: Live): Tally => ({ a: l.web.a + l.tiktok.a + l.gift.a, b: l.web.b + l.tiktok.b + l.gift.b });

let voteTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleVotePush() {
  if (voteTimer) return;
  voteTimer = setTimeout(() => { voteTimer = null; setOverlayVotes(totalVotes(live)); }, 400);
}
/** Tujuan bawaan di bagian Gimmick untuk tiap jenis kiriman penonton. */
export const KIND_TO_GIMMICK: Record<string, GimmickId> = {
  confession: "confession", hottake: "hottake", spin: "spin", thisorthat: "thisorthat", problem: "chaos", question: "spin",
};
/** Jenis kiriman yang tampil sebagai gelembung antrean di overlay (bukan mengganti ronde). */
export const QUEUE_KINDS = new Set(["confession", "spin"]);
/** Jenis kiriman yang bisa disimpan ke Question Bank. */
export const BANKABLE_KINDS = new Set(["confession", "hottake", "spin", "thisorthat", "problem", "question"]);

/* ---------- VIP gifter ---------- */
export const TIER_BADGE = ["", "⭐", "💎", "👑"];
export const TIER_NAME = ["", "Supporter", "VIP", "Sultan"];
export function tierFor(diamonds: number): number {
  const [t1, t2, t3] = getSettings().vipTiers;
  if (diamonds <= 0) return 0;
  return diamonds >= t3 ? 3 : diamonds >= t2 ? 2 : diamonds >= t1 ? 1 : 0;
}
export const tierOfUser = (uid: string | null | undefined) => (uid ? tierFor(live.gifters[uid]?.diamonds ?? 0) : 0);
/** Tier gifter berdasarkan username TikTok (@handle) yang dicocokkan dari event gift. */
export function tierOfHandle(handle: string | null | undefined) {
  const h = (handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!h) return 0;
  const g = Object.values(live.gifters).find((x) => x.handle === h);
  return g ? tierFor(g.diamonds) : 0;
}
/** Tier VIP pengirim sebuah kiriman: dari komentar TikTok (fingerprint "tt:<id>") atau dari kolom username opsional di form link. */
export const vipOf = (s: Submission) =>
  s.fingerprint?.startsWith("tt:") ? tierOfUser(s.fingerprint.slice(3)) : s.tiktok_user ? tierOfHandle(s.tiktok_user) : 0;
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
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function nextBanner() {
  const t = bannerQ.shift();
  if (!t) { bannerTimer = null; return; }
  showBanner(t);
  bannerTimer = setTimeout(nextBanner, 4500);
}
function pushBanner(text: string) {
  bannerQ.push(text);
  if (bannerQ.length > 8) bannerQ.shift();
  if (!bannerTimer) nextBanner();
}

/* ---------- antrean overlay ---------- */
let queueTimer: ReturnType<typeof setTimeout> | null = null;
let queueBase: OverlayPayload | null = null;
const stillOurs = () => readOverlay().payload?.gimmick === "audience";
/** Gimmick yang sedang tayang (gelembung antrean dihitung sebagai gimmick dasarnya). */
export function onAirGimmick(): string | null {
  const p = readOverlay().payload;
  if (p?.gimmick === "audience") return queueBase?.gimmick ?? null;
  return p?.gimmick ?? null;
}
function queueTick() {
  queueTimer = null;
  if (live.nowShowing && !stillOurs()) { queueBase = null; setLive({ queue: [], nowShowing: null }); return; } // kamu pindah gimmick manual
  const next = live.queue[0];
  if (!next) {
    if (queueBase) pushOverlay({ ...readOverlay(), payload: queueBase, visible: true, payloadAt: Date.now(), votes: undefined });
    queueBase = null;
    setLive({ nowShowing: null });
    return;
  }
  setLive({ queue: live.queue.slice(1), nowShowing: next });
  const badge = TIER_BADGE[vipOf(next)] ?? "";
  const label = isFast(next) ? `⚡ ${badge ? `${badge} ` : ""}${next.nickname ? `@${next.nickname}` : "Anonim"}` : next.nickname ? `${badge ? `${badge} ` : ""}${next.nickname}` : "";
  sendToOverlay({ gimmick: "audience", kind: next.kind, content: next.content ?? "", ...(label ? { nickname: label } : {}) });
  void liveActions.setStatus(next.id, "shown");
  queueTimer = setTimeout(queueTick, Math.max(2, getSettings().queueSeconds) * 1000);
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
        inbox: status === "pending" ? [moved, ...without(live.inbox)].sort(byNewest).slice(0, 100) : without(live.inbox),
        review: status === "review" ? [moved, ...without(live.review)].sort(byNewest).slice(0, 100) : without(live.review),
        history: status !== "pending" && status !== "review" ? [moved, ...without(live.history)].sort(byNewest).slice(0, 100) : without(live.history),
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
  /** Masukkan kiriman ke antrean overlay (confession / spin). Tiap item tampil `queueSeconds` detik lalu diganti berikutnya. */
  enqueue(s: Submission) {
    if (!QUEUE_KINDS.has(s.kind) || s.flagged || s.status === "review") return false;
    if (live.queue.some((x) => x.id === s.id) || live.nowShowing?.id === s.id) return false;
    const rank = fastRank(s);
    const at = live.queue.findIndex((x) => fastRank(x) < rank); // fast track didahulukan, tapi tidak memotong item yang sedang tampil
    setLive({ queue: at === -1 ? [...live.queue, s] : [...live.queue.slice(0, at), s, ...live.queue.slice(at)] });
    if (!queueTimer && !live.nowShowing) {
      const cur = readOverlay().payload;
      queueBase = cur && cur.gimmick !== "audience" ? cur : null;
      queueTick();
    }
    return true;
  },
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
  skipQueue() { if (queueTimer) clearTimeout(queueTimer); queueTick(); },
  clearQueue() { if (queueTimer) clearTimeout(queueTimer); setLive({ queue: [] }); queueTick(); },
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
  async saveToBank(s: Submission, target?: GimmickId): Promise<{ ok: boolean; message: string }> {
    let text = (s.content ?? "").trim();
    if (!text) return { ok: false, message: "Isi kosong, tidak bisa disimpan." };
    if (!BANKABLE_KINDS.has(s.kind)) return { ok: false, message: "Jenis kiriman ini tidak disimpan ke Question Bank." };
    if (!ownerId || !hasRemote()) return { ok: false, message: "Belum tersambung ke database. Tunggu sebentar lalu coba lagi." };
    const dest: GimmickId = target ?? KIND_TO_GIMMICK[s.kind] ?? "spin";
    const destName = GIMMICKS.find((g) => g.id === dest)?.name ?? dest;
    if (dest === "thisorthat") text = text.replace(" | ", " || "); // format Question Bank untuk This or That
    const duplicate = isDuplicate(text);
    if (!duplicate) {
      const { error } = await supabase.from("questions").insert({
        id: crypto.randomUUID(), text, gimmick: dest,
        category: VIEWER_CATEGORY, favorite: false, used: false, demo: false,
      });
      if (error) {
        console.error("saveToBank gagal", error);
        return { ok: false, message: `Gagal menyimpan ke Question Bank: ${error.message}` };
      }
      actions.addCategory(VIEWER_CATEGORY);
      await resyncQuestions();
    }
    const marked = await liveActions.setStatus(s.id, "approved");
    if (!marked) return { ok: false, message: "Sudah masuk Question Bank, tapi status inbox gagal diperbarui. Coba tekan lagi." };
    return { ok: true, message: duplicate ? "Isi yang sama sudah ada di Question Bank." : `Tersimpan di Question Bank → ${destName} ✅` };
  },
  async rotateIngestKey() {
    const { data, error } = await supabase.rpc("rotate_ingest_key");
    if (error || !data) { toast.error("Gagal mengganti kunci konektor."); return false; }
    setLive({ ingestKey: data as string });
    return true;
  },
  clearFeed() { setLive({ feed: [] }); },
  /** Kirim event palsu lewat jalur yang sama dengan konektor TikTok, untuk menguji alur tanpa live. */
  async sendTestEvent(kind: "comment-a" | "comment-b" | "comment" | "spin" | "gift" | "gift-big" | "follow") {
    if (!live.ingestKey) { toast.error("Kunci konektor belum siap."); return false; }
    const newUser = () => `test-${Math.random().toString(36).slice(2, 8)}`;
    if (kind === "comment-a" || kind === "comment-b") testUser = newUser();
    const user = kind === "comment" || kind === "follow" ? newUser() : testUser; // spin & gift memakai penguji yang sama agar VIP bisa dicoba
    const ev: Record<string, unknown> =
      kind === "comment-a" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "A" } :
      kind === "comment-b" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "B" } :
      kind === "comment" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "Halo Kyoka, tes komentar!" } :
      kind === "spin" ? { type: "comment", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", content: "!spin Makanan apa yang bikin kamu kangen rumah?" } :
      kind === "gift-big" ? { type: "gift", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", gift_name: "Galaxy", gift_count: 1, diamonds: 1500 } :
      kind === "gift" ? { type: "gift", user_id: user, nickname: "penonton_uji", handle: "penonton_uji", gift_name: getSettings().giftRules[0]?.name ?? "Rose", gift_count: 1, diamonds: 1 } :
      { type: "follow", user_id: user, nickname: "penonton_uji", handle: "penonton_uji" };
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
let dbTimer: ReturnType<typeof setTimeout> | null = null;
let ownerId: string | null = null;
let testUser = "test-awal";
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
  if (dbTimer) clearTimeout(dbTimer);
  dbTimer = setTimeout(() => {
    if (!ownerId) return;
    supabase.from("studio_sessions").update({ overlay_state: withCode as never, audience_state: aud as never, updated_at: new Date().toISOString() }).eq("owner_id", ownerId).then();
  }, 600);
}

function sendAudience() {
  audienceCh?.send({ type: "broadcast", event: "state", payload: { ...audienceStateFor(readOverlay()), intake: live.intake } });
}

type Row = { id: string; text: string; gimmick: string; category: string; favorite: boolean; used: boolean; demo: boolean; created_at: string };
const toQ = (r: Row): Question => ({ id: r.id, text: r.text, gimmick: r.gimmick as GimmickId, category: r.category, favorite: r.favorite, used: r.used, demo: r.demo, createdAt: Date.parse(r.created_at) });

async function resyncQuestions() {
  const { data, error } = await supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(1000);
  if (!error && data) replaceQuestions((data as Row[]).map(toQ));
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

/** Proses satu event dari konektor TikTok (komentar, gift, follow, share, status koneksi). */
function handleLiveEvent(e: LiveEvent) {
  if (e.type === "system") {
    const [kind = "", handle = ""] = (e.content ?? "").split(":");
    setLive({ tiktokLive: { connected: kind !== "disconnected", handle, at: Date.now() } });
    return;
  }
  if (e.type === "join" || e.type === "like") return; // terlalu ramai untuk ditampilkan
  setLive({ feed: [e, ...live.feed.filter((x) => x.id !== e.id)].slice(0, 60) });
  const who = `@${e.nickname || e.user_id || "penonton"}`;
  if (e.type === "comment" && e.vote_choice && e.round_id === live.round && (e.vote_choice === "a" || e.vote_choice === "b")) {
    if (e.user_id) userSide.set(e.user_id, e.vote_choice);
    liveActions.addTiktok(e.vote_choice, 1);
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
      const { data: inbox } = await supabase.from("audience_submissions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      const { data: rev } = await supabase.from("audience_submissions").select("*").eq("status", "review").order("created_at", { ascending: false }).limit(100);
      // Pengaturan + jendela input (kolom baru paket 1); dilewati kalau migrasinya belum jalan.
      const cfg = await supabase.from("studio_sessions").select("settings, intake").eq("owner_id", userId).maybeSingle();
      const cfgRow = cfg.error ? null : (cfg.data as unknown as { settings?: Record<string, unknown> | null; intake?: Partial<Intake> | null } | null);
      const { data: hist } = await supabase.from("audience_submissions").select("*").in("status", ["approved", "shown", "rejected"]).order("created_at", { ascending: false }).limit(100);
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
            .then(({ data, error }) => { if (error || !data?.length) dbFailed("Perubahan", error ?? { message: "tidak ada baris yang diubah" }); });
        },
        remove: (id) => {
          supabase.from("questions").delete().eq("id", id).then(({ error }) => { if (error) dbFailed("Penghapusan", error); });
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
          setLive({ inbox: sortVip([r, ...live.inbox]).slice(0, 100) });
          // Antrean otomatis: hanya kiriman bersih yang cocok dengan gimmick yang sedang tayang.
          const st = getSettings();
          if ((st.autoQueue || (st.vipAutoQueue && isFast(r))) && QUEUE_KINDS.has(r.kind) && onAirGimmick() === r.kind) liveActions.enqueue(r);
        } else if (r.status === "review") setLive({ review: [r, ...live.review].slice(0, 100) });
      }).subscribe();
    // Channel terpisah: kalau tabel live_events belum ada, inbox penonton tetap jalan.
    const evCh = supabase.channel(`events-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_events", filter: `owner_id=eq.${userId}` }, (e) => handleLiveEvent(e.new as LiveEvent))
      .subscribe();
    // Simpan perubahan pengaturan/kategori ke database (ditunda 1 detik agar tidak menulis setiap ketikan).
    const offPersist = onPersistChange(() => {
      if (!settingsSync) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => persistSettingsNow(userId), 1000);
    });
    // Koneksi dianggap putus kalau konektor tidak mengirim heartbeat selama 60 detik.
    const staleTimer = setInterval(() => {
      if (live.tiktokLive.connected && Date.now() - live.tiktokLive.at > 60_000) setLive({ tiktokLive: { ...live.tiktokLive, connected: false } });
    }, 10_000);
    return () => {
      cancelled = true; setRemote(null); supabase.removeChannel(ch); supabase.removeChannel(evCh); clearInterval(staleTimer); offPersist(); if (persistTimer) clearTimeout(persistTimer); if (queueTimer) clearTimeout(queueTimer); if (bannerTimer) clearTimeout(bannerTimer); bannerTimer = null; bannerQ.length = 0;
      if (overlayCh) supabase.removeChannel(overlayCh);
      if (audienceCh) supabase.removeChannel(audienceCh);
      overlayCh = audienceCh = null;
    };
  }, [userId]);
  return ready;
}

export type { OverlayPayload };

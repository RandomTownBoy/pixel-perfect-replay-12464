import { useEffect, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  actions, getSettings, hasRemote, isDuplicate, readOverlay, replaceQuestions, setOverlayVotes, setRemote, showBanner,
  type GimmickId, type OverlayPayload, type OverlayState, type Question,
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
};
export type LiveEvent = {
  id: string; type: string; user_id: string | null; nickname: string | null; content: string | null;
  gift_name: string | null; gift_count: number; diamonds: number; vote_choice: string | null;
  round_id: string | null; created_at: string;
};
type TiktokStatus = { connected: boolean; handle: string; at: number };
type Tally = { a: number; b: number };
type Live = {
  overlayToken: string | null; audienceCode: string | null; overlayConnected: boolean;
  round: string; web: Tally; tiktok: Tally; gift: Tally; inbox: Submission[]; history: Submission[];
  ingestKey: string | null; feed: LiveEvent[]; tiktokLive: TiktokStatus;
  giftLog: { id: string; text: string; at: number }[];
};
let live: Live = {
  overlayToken: null, audienceCode: null, overlayConnected: false, round: "",
  web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 }, inbox: [], history: [], giftLog: [],
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
const BANK_CATEGORY = "Dari Penonton";
const KIND_TO_GIMMICK: Record<string, GimmickId> = { confession: "confession", problem: "chaos", question: "spin" };

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
    const before = { inbox: live.inbox, history: live.history };
    const item = [...live.inbox, ...live.history].find((x) => x.id === id);
    if (item) {
      const moved = { ...item, status };
      const byNewest = (a: Submission, b: Submission) => Date.parse(b.created_at) - Date.parse(a.created_at);
      setLive(status === "pending"
        ? { inbox: [moved, ...live.inbox.filter((x) => x.id !== id)].sort(byNewest).slice(0, 100), history: live.history.filter((x) => x.id !== id) }
        : { inbox: live.inbox.filter((x) => x.id !== id), history: [moved, ...live.history.filter((x) => x.id !== id)].sort(byNewest).slice(0, 100) });
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
  /** Simpan isi kiriman penonton ke Question Bank, lalu tandai sebagai "approved". */
  async saveToBank(s: Submission): Promise<{ ok: boolean; message: string }> {
    const text = (s.content ?? "").trim();
    if (!text) return { ok: false, message: "Isi kosong, tidak bisa disimpan." };
    if (!ownerId || !hasRemote()) return { ok: false, message: "Belum tersambung ke database. Tunggu sebentar lalu coba lagi." };
    const duplicate = isDuplicate(text);
    if (!duplicate) {
      const { error } = await supabase.from("questions").insert({
        id: crypto.randomUUID(), text, gimmick: KIND_TO_GIMMICK[s.kind] ?? "spin",
        category: BANK_CATEGORY, favorite: false, used: false, demo: false,
      });
      if (error) {
        console.error("saveToBank gagal", error);
        return { ok: false, message: `Gagal menyimpan ke Question Bank: ${error.message}` };
      }
      actions.addCategory(BANK_CATEGORY);
      await resyncQuestions();
    }
    const marked = await liveActions.setStatus(s.id, "approved");
    if (!marked) return { ok: false, message: "Sudah masuk Question Bank, tapi status inbox gagal diperbarui. Coba tekan lagi." };
    return { ok: true, message: duplicate ? "Isi yang sama sudah ada di Question Bank." : "Tersimpan di Question Bank ✅" };
  },
  async rotateIngestKey() {
    const { data, error } = await supabase.rpc("rotate_ingest_key");
    if (error || !data) { toast.error("Gagal mengganti kunci konektor."); return false; }
    setLive({ ingestKey: data as string });
    return true;
  },
  clearFeed() { setLive({ feed: [] }); },
  /** Kirim event palsu lewat jalur yang sama dengan konektor TikTok, untuk menguji alur tanpa live. */
  async sendTestEvent(kind: "comment-a" | "comment-b" | "comment" | "gift" | "follow") {
    if (!live.ingestKey) { toast.error("Kunci konektor belum siap."); return false; }
    const newUser = () => `test-${Math.random().toString(36).slice(2, 8)}`;
    if (kind === "comment-a" || kind === "comment-b") testUser = newUser();
    const user = kind === "comment" || kind === "follow" ? newUser() : testUser;
    const ev: Record<string, unknown> =
      kind === "comment-a" ? { type: "comment", user_id: user, nickname: "penonton_uji", content: "A" } :
      kind === "comment-b" ? { type: "comment", user_id: user, nickname: "penonton_uji", content: "B" } :
      kind === "comment" ? { type: "comment", user_id: user, nickname: "penonton_uji", content: "Halo Kyoka, tes komentar!" } :
      kind === "gift" ? { type: "gift", user_id: user, nickname: "penonton_uji", gift_name: getSettings().giftRules[0]?.name ?? "Rose", gift_count: 1, diamonds: 1 } :
      { type: "follow", user_id: user, nickname: "penonton_uji" };
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
  switch (p.gimmick) {
    case "thisorthat": return { ...base, mode: "vote", a: p.a, b: p.b, title: "This or That" };
    case "hottake": return { ...base, mode: "vote", a: "Setuju 👍", b: "Gak setuju 👎", title: p.topic };
    case "confession": return { ...base, mode: "confession", title: p.prompt };
    case "chaos": return p.mode === "solution" ? { ...base, mode: "problem", title: p.problem } : { ...base, mode: "question", title: "Random Story: " + p.words.join(", ") };
    case "spin": return { ...base, mode: "question", title: p.question ?? "Spin the Question" };
    case "card": return { ...base, mode: "question", title: p.text ?? "Pick a Card" };
    default: return { ...base, mode: "question", title: "Kirim pertanyaan buat Kyoka" };
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
  audienceCh?.send({ type: "broadcast", event: "state", payload: aud });
  if (dbTimer) clearTimeout(dbTimer);
  dbTimer = setTimeout(() => {
    if (!ownerId) return;
    supabase.from("studio_sessions").update({ overlay_state: withCode as never, audience_state: aud as never, updated_at: new Date().toISOString() }).eq("owner_id", ownerId).then();
  }, 600);
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
  const rule = matchGiftRule(e.gift_name);
  const count = Math.max(1, e.gift_count || 1);
  const p = readOverlay().payload;
  const voting = p?.gimmick === "thisorthat" || p?.gimmick === "hottake";
  if (!rule) { liveActions.logGift(`🎁 ${who} kirim ${e.gift_name ?? "gift"} ×${count}`); return; }
  if (rule.effect === "vote" && voting) {
    const side = e.user_id ? userSide.get(e.user_id) : undefined;
    if (side) {
      const w = rule.weight * count;
      liveActions.addGift(side, w, `${rule.emoji} ${who} → ${side.toUpperCase()} +${w}`);
      showBanner(`${rule.emoji} ${who} kirim ${rule.name}! ${side.toUpperCase()} +${w} suara`);
    } else {
      liveActions.logGift(`${rule.emoji} ${who} kirim ${rule.name} — belum pilih A/B lewat komentar, suara tidak dihitung`);
    }
    return;
  }
  liveActions.logGift(`${rule.emoji} ${who}: ${rule.reward}`);
  showBanner(`${rule.emoji} Makasih ${who} untuk ${rule.name}! ${rule.reward}`);
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
      let { data: sess } = await supabase.from("studio_sessions").select("overlay_token, audience_code, ingest_key").eq("owner_id", userId).maybeSingle();
      if (!sess) {
        const ins = await supabase.from("studio_sessions").insert({ owner_id: userId }).select("overlay_token, audience_code, ingest_key").single();
        sess = ins.data;
      }
      const { data: qs } = await supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(1000);
      const { data: inbox } = await supabase.from("audience_submissions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
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
      setLive({ overlayToken: sess?.overlay_token ?? null, audienceCode: sess?.audience_code ?? null, ingestKey: (sess as { ingest_key?: string } | null)?.ingest_key ?? null, inbox: inbox ?? [], history: hist ?? [], round: String(readOverlay().payloadAt || "") });
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
    } catch (e) { console.error("sync failed", e); } finally { if (!cancelled) setReady(true); } })();
    const ch = supabase.channel(`subs-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audience_submissions", filter: `owner_id=eq.${userId}` }, (e) => {
        const r = e.new as Submission;
        if (r.kind === "vote") {
          if (r.round_id === live.round && (r.choice === "a" || r.choice === "b")) {
            setLive({ web: { ...live.web, [r.choice]: live.web[r.choice] + 1 } }); scheduleVotePush();
          }
        } else if (r.status === "pending") setLive({ inbox: [r, ...live.inbox].slice(0, 100) });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_events", filter: `owner_id=eq.${userId}` }, (e) => handleLiveEvent(e.new as LiveEvent))
      .subscribe();
    // Koneksi dianggap putus kalau konektor tidak mengirim heartbeat selama 60 detik.
    const staleTimer = setInterval(() => {
      if (live.tiktokLive.connected && Date.now() - live.tiktokLive.at > 60_000) setLive({ tiktokLive: { ...live.tiktokLive, connected: false } });
    }, 10_000);
    return () => {
      cancelled = true; setRemote(null); supabase.removeChannel(ch); clearInterval(staleTimer);
      if (overlayCh) supabase.removeChannel(overlayCh);
      if (audienceCh) supabase.removeChannel(audienceCh);
      overlayCh = audienceCh = null;
    };
  }, [userId]);
  return ready;
}

export type { OverlayPayload };

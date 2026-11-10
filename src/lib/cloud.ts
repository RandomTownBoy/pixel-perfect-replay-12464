import { useEffect, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  readOverlay, replaceQuestions, setOverlayVotes, setRemote,
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
type Tally = { a: number; b: number };
type Live = {
  overlayToken: string | null; audienceCode: string | null; overlayConnected: boolean;
  round: string; web: Tally; tiktok: Tally; gift: Tally; inbox: Submission[];
  giftLog: { id: string; text: string; at: number }[];
};
let live: Live = {
  overlayToken: null, audienceCode: null, overlayConnected: false, round: "",
  web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 }, inbox: [], giftLog: [],
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
  async setStatus(id: string, status: string) {
    setLive({ inbox: live.inbox.filter((x) => x.id !== id) });
    await supabase.from("audience_submissions").update({ status }).eq("id", id);
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
  if (round !== live.round) { setLive({ round, web: { a: 0, b: 0 }, tiktok: { a: 0, b: 0 }, gift: { a: 0, b: 0 } }); }
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

/** Mount once inside the signed-in area: loads data and wires realtime. */
export function useCloudSync(userId: string | undefined) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!userId) return;
    ownerId = userId;
    let cancelled = false;
    (async () => {
      let { data: sess } = await supabase.from("studio_sessions").select("overlay_token, audience_code").eq("owner_id", userId).maybeSingle();
      if (!sess) {
        const ins = await supabase.from("studio_sessions").insert({ owner_id: userId }).select("overlay_token, audience_code").single();
        sess = ins.data;
      }
      const { data: qs } = await supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(1000);
      const { data: inbox } = await supabase.from("audience_submissions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
      if (cancelled) return;
      replaceQuestions((qs ?? []).map(toQ));
      setLive({ overlayToken: sess?.overlay_token ?? null, audienceCode: sess?.audience_code ?? null, inbox: inbox ?? [], round: String(readOverlay().payloadAt || "") });
      setRemote({
        insert: (rows) => { supabase.from("questions").insert(rows.map((q) => ({ id: q.id, text: q.text, gimmick: q.gimmick, category: q.category, favorite: q.favorite, used: q.used, demo: !!q.demo }))).then(); },
        update: (id, p) => {
          const patch: { text?: string; category?: string; favorite?: boolean; used?: boolean; gimmick?: string } = {};
          for (const k of ["text", "category", "favorite", "used", "gimmick"] as const) if (k in p) (patch as Record<string, unknown>)[k] = p[k];
          supabase.from("questions").update(patch).eq("id", id).then();
        },
        remove: (id) => { supabase.from("questions").delete().eq("id", id).then(); },
        overlay: pushRemote,
      });
      connectChannels();
      setReady(true);
    })();
    const ch = supabase.channel(`subs-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audience_submissions", filter: `owner_id=eq.${userId}` }, (e) => {
        const r = e.new as Submission;
        if (r.kind === "vote") {
          if (r.round_id === live.round && (r.choice === "a" || r.choice === "b")) {
            setLive({ web: { ...live.web, [r.choice]: live.web[r.choice] + 1 } }); scheduleVotePush();
          }
        } else if (r.status === "pending") setLive({ inbox: [r, ...live.inbox].slice(0, 100) });
      }).subscribe();
    return () => {
      cancelled = true; setRemote(null); supabase.removeChannel(ch);
      if (overlayCh) supabase.removeChannel(overlayCh);
      if (audienceCh) supabase.removeChannel(audienceCh);
      overlayCh = audienceCh = null;
    };
  }, [userId]);
  return ready;
}

export type { OverlayPayload };

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/live/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ikut main bareng Kyoka LIVE" },
      { name: "description", content: "Vote, kirim confession anonim, dan ikut gimmick Kyoka LIVE." },
      { property: "og:title", content: "Ikut main bareng Kyoka LIVE" },
      { property: "og:description", content: "Vote dan kirim confession anonim saat Kyoka LIVE." },
    ],
  }),
  component: Audience,
});

type AState = { live?: boolean; round?: string; mode?: string; a?: string; b?: string; title?: string };

function Audience() {
  const { code } = Route.useParams();
  const [st, setSt] = useState<AState | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<"now" | "confess" | "ask">("now");
  const [text, setText] = useState("");
  const [nick, setNick] = useState("");
  const [voted, setVoted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("get_audience_state", { _code: code }).then(({ data, error }) => {
      if (error || data === null) return setMissing(true);
      setSt(data as AState);
    });
    const ch = supabase.channel(`audience-${code.toLowerCase()}`)
      .on("broadcast", { event: "state" }, ({ payload }) => setSt(payload as AState)).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [code]);

  useEffect(() => { if (st?.round) setVoted(localStorage.getItem(`kyoka-vote-${code}-${st.round}`)); }, [st?.round, code]);

  const send = async (kind: string, content: string, choice?: string, nickname = nick) => {
    setBusy(true);
    const { error } = await supabase.rpc("submit_audience", { _code: code, _kind: kind, _round: st?.round ?? "", _choice: choice ?? "", _content: content, _nickname: nickname });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    return true;
  };
  const vote = async (c: "a" | "b") => {
    if (voted || !st?.round) return;
    if (await send("vote", "", c)) { localStorage.setItem(`kyoka-vote-${code}-${st.round}`, c); setVoted(c); toast.success("Vote masuk!"); }
  };
  const submitText = async (kind: string) => {
    if (await send(kind, text, undefined, kind === "confession" ? "" : nick)) { setText(""); toast.success(kind === "confession" ? "Confession terkirim, aman & anonim 🤫" : "Terkirim ke Kyoka!"); }
  };

  if (missing) return <Center>Link LIVE tidak ditemukan.</Center>;
  if (!st) return <Center>Memuat…</Center>;
  const textKind = tab === "confess" ? "confession" : st.mode === "problem" && tab === "now" ? "problem" : "question";

  return (
    <div className="mx-auto min-h-screen max-w-md p-4">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-party font-display font-black shadow-pop">K</span>
        <div className="flex-1"><h1 className="font-display text-sm font-bold">KYOKA LIVE</h1>
          <p className="text-xs text-muted-foreground">{st.live === false ? "Overlay lagi istirahat" : "Ikut main sekarang!"}</p></div>
        <span className="flex items-center gap-1.5 rounded-full bg-pop/20 px-2.5 py-1 text-xs font-bold text-pop"><span className="h-2 w-2 animate-pulse rounded-full bg-pop" />LIVE</span>
      </header>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {([["now", "Sekarang"], ["confess", "Confess 🤫"], ["ask", "Tanya"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "now" && st.mode === "vote" && (
        <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
          {st.title && <p className="text-center font-display font-bold">{st.title}</p>}
          {(["a", "b"] as const).map((c) => (
            <button key={c} disabled={!!voted || busy} onClick={() => vote(c)}
              className={`w-full rounded-2xl p-5 font-display text-lg font-bold transition active:scale-95 ${c === "a" ? "bg-primary text-primary-foreground" : "bg-electric text-background"} ${voted && voted !== c ? "opacity-35" : ""}`}>
              {c.toUpperCase()} · {c === "a" ? st.a : st.b} {voted === c && "✓"}
            </button>
          ))}
          <p className="text-center text-xs text-muted-foreground">{voted ? "Makasih! Lihat hasilnya di LIVE." : "Atau komen A / B di TikTok. Gift bikin suaramu makin berat 🎁"}</p>
        </div>
      )}
      {tab === "now" && st.mode !== "vote" && (
        <div className="mb-4 rounded-2xl border border-border bg-panel p-5 text-center">
          <p className="text-xs font-semibold text-muted-foreground">{st.mode === "confession" ? "Confession Time" : st.mode === "problem" ? "Random Solution — kirim masalahmu!" : "Lagi dibahas"}</p>
          <p className="mt-2 font-display text-lg font-bold">{st.title ?? "Tunggu gimmick berikutnya…"}</p>
        </div>
      )}
      {(tab !== "now" || st.mode !== "vote") && (
        <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={4}
            placeholder={textKind === "confession" ? "Ngaku aja… (anonim, jangan tulis info pribadi)" : textKind === "problem" ? "Masalah random kamu…" : "Pertanyaan / cerita buat Kyoka…"}
            className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
          {textKind !== "confession" && <Input placeholder="Nickname (opsional)" maxLength={30} value={nick} onChange={(e) => setNick(e.target.value)} />}
          <Button size="lg" variant="live" className="w-full" disabled={busy || text.trim().length < 3}
            onClick={() => submitText(textKind)}>Kirim</Button>
          {textKind === "confession" && <p className="text-xs text-muted-foreground">Confession dikirim tanpa nama. Kyoka memilih mana yang dibacakan.</p>}
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}

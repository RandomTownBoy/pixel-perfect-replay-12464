import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Intake, OverlayPayload, OverlayState } from "@/lib/kyoka";
import { DEFAULT_INTAKE, GIMMICKS } from "@/lib/kyoka";

const ACCENT: Record<string, string> = { purple: "var(--primary)", blue: "var(--electric)", pink: "var(--pop)", yellow: "var(--zest)" };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(660, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.3);
  } catch { /* autoplay blocked */ }
}

/** Tulisan panduan untuk penonton, menyesuaikan gimmick yang tayang dan input yang sedang dibuka. */
function guideLines(p: OverlayPayload, intake?: Intake): string[] {
  const it = { ...DEFAULT_INTAKE, ...(intake ?? {}) };
  const link = (ok: boolean, text: string) => (ok ? [text] : []);
  switch (p.gimmick) {
    case "thisorthat": return ["Komen A atau B untuk vote", ...link(it.thisorthat, "Usul pilihan lewat link di bio")];
    case "hottake": return ["Komen SETUJU atau TIDAK untuk vote", ...link(it.hottake, "Kirim hot take lewat link di bio")];
    case "spin": return link(it.spin, "Ketik !spin lalu pertanyaanmu");
    case "confession": return link(it.confession, "Confess anonim lewat link di bio");
    case "chaos": return link(it.chaos, "Kirim 3 kata lewat link di bio");
    case "audience":
      return p.kind === "confession" ? link(it.confession, "Confess anonim lewat link di bio") : p.kind === "spin" ? link(it.spin, "Ketik !spin lalu pertanyaanmu") : [];
    default: return [];
  }
}
const GUIDE_POS: Record<string, string> = {
  tr: "right-[3%] top-[11%] items-end text-right", tl: "left-[3%] top-[11%] items-start text-left",
  br: "right-[3%] bottom-[3%] items-end text-right", bl: "left-[3%] bottom-[3%] items-start text-left",
};

export function OverlayView({ state, preview }: { state: OverlayState; preview?: boolean }) {
  const p = state.payload;
  const last = useRef(state.payloadAt);
  useEffect(() => {
    if (!preview && state.sound && state.payloadAt !== last.current && p) beep();
    last.current = state.payloadAt;
  }, [state.payloadAt, state.sound, p, preview]);
  const [bannerOn, setBannerOn] = useState(false);
  useEffect(() => {
    if (!state.banner || Date.now() - state.banner.at > 8000) return;
    setBannerOn(true);
    if (!preview && state.sound) beep();
    const t = setTimeout(() => setBannerOn(false), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.banner?.at]);

  const style = { "--ov": ACCENT[state.accent] ?? "var(--primary)", fontSize: `${state.textScale}em` } as CSSProperties;
  const g = p ? GIMMICKS.find((x) => x.id === p.gimmick) : null;

  return (
    <div style={style} className="relative flex h-full w-full flex-col items-center justify-center gap-[1.2em] p-[4%] text-foreground">
      {state.visible && bannerOn && state.banner && (
        <div key={state.banner.at} className="animate-pop-in absolute inset-x-[4%] top-[3%] z-10 rounded-[1em] bg-party px-[1em] py-[0.6em] text-center font-display text-[1.1em] font-bold shadow-pop">
          {state.banner.text}
        </div>
      )}
      {!state.visible ? null : !p ? (
        preview ? <p className="text-[0.9em] text-muted-foreground">Overlay kosong — kirim gimmick dari dashboard</p> : null
      ) : (
        <div key={state.payloadAt} className="animate-pop-in flex w-full flex-col items-center gap-[1em]">
          {state.showTitle && g && (
            <div className="rounded-full px-[1.2em] py-[0.4em] font-display text-[1.1em] font-bold shadow-pop" style={{ background: "var(--ov)" }}>
              {g.emoji} {g.name}
            </div>
          )}
          <Body state={state} />
          {state.votes && (p.gimmick === "thisorthat" || p.gimmick === "hottake") && <VoteBar votes={state.votes} labels={p.gimmick === "hottake" ? ["Setuju", "Gak setuju"] : ["A", "B"]} />}
          {(p.gimmick === "thisorthat" || p.gimmick === "hottake") && (
            <p className="text-center text-[0.85em] font-semibold">
              {p.gimmick === "hottake" ? <>Komen <b className="text-zest">SETUJU</b> / <b className="text-zest">TIDAK</b> 🗳️</> : <>Komen <b className="text-zest">A</b> / <b className="text-zest">B</b> 🗳️</>}
            </p>
          )}
          {state.showBadge && <div className="mt-[0.5em] font-display text-[0.7em] font-bold tracking-[0.3em] text-gradient">KYOKA LIVE</div>}
        </div>
      )}
      {state.visible && p && state.guidePos !== "off" && (() => {
        const lines = guideLines(p, state.intake);
        if (!lines.length) return null;
        return (
          <div className={`pointer-events-none absolute z-[5] flex max-w-[48%] flex-col gap-[0.25em] rounded-[0.8em] bg-background/80 px-[0.9em] py-[0.6em] text-[0.72em] font-semibold leading-snug shadow-glow backdrop-blur ${GUIDE_POS[state.guidePos ?? "tr"] ?? GUIDE_POS.tr}`}>
            {lines.map((l) => <span key={l}>💬 {l}</span>)}
          </div>
        );
      })()}
    </div>
  );
}

function Bubble({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return (
    <div className={`w-full rounded-[1.4em] border-[0.15em] bg-background/85 p-[1.2em] text-center font-display font-bold leading-tight shadow-glow backdrop-blur ${big ? "text-[2em]" : "text-[1.5em]"}`} style={{ borderColor: "var(--ov)" }}>
      {children}
    </div>
  );
}

function Body({ state }: { state: OverlayState }) {
  const p = state.payload!;
  switch (p.gimmick) {
    case "spin":
      return p.spinning ? (
        <div className="animate-wiggle text-[5em]">🎡</div>
      ) : (
        <>
          {p.category && <span className="text-[0.9em] font-semibold text-muted-foreground">{p.category}</span>}
          <Bubble big>{p.question}</Bubble>
        </>
      );
    case "thisorthat":
      return <ThisOrThat a={p.a} b={p.b} end={p.countdownEnd} />;
    case "card":
      return (
        <div className="flex flex-col items-center gap-[1em]">
          <div className="flex flex-wrap justify-center gap-[0.6em]">
            {Array.from({ length: p.count }).map((_, i) => (
              <div key={i} className={`flex h-[4.5em] w-[3.2em] items-center justify-center rounded-[0.6em] font-display text-[1.4em] font-bold transition-all ${p.revealed === i ? "scale-110 bg-party shadow-pop" : "bg-panel border border-border opacity-70"}`}>
                {p.revealed === i ? "✦" : i + 1}
              </div>
            ))}
          </div>
          {p.text && <Bubble>{p.text}</Bubble>}
        </div>
      );
    case "hottake":
      return (
        <>
          <div className="animate-float text-[3.5em]">🔥</div>
          <Bubble big>“{p.topic}”</Bubble>
          {p.followups?.length ? (
            <ul className="w-full space-y-[0.4em] text-[1em]">
              {p.followups.map((f) => <li key={f} className="rounded-[0.8em] bg-background/75 px-[1em] py-[0.5em]">💬 {f}</li>)}
            </ul>
          ) : null}
        </>
      );
    case "audience":
      return (
        <>
          <span className="rounded-full bg-pop/30 px-[1em] py-[0.2em] text-[0.9em] font-semibold">{p.kind === "confession" ? "🤫 Confession anonim" : p.kind === "spin" ? "🎡 Pertanyaan dari penonton" : p.kind === "problem" ? "🌀 Masalah dari penonton" : "💬 Dari penonton"}</span>
          <Bubble big>{p.content}</Bubble>
          <p className="text-[0.9em] text-muted-foreground">— {p.nickname || "Anonim"}</p>
        </>
      );
    case "confession":
      return (
        <>
          <div className="text-[3.5em]">🤫</div>
          {p.category && <span className="rounded-full bg-pop/30 px-[1em] py-[0.2em] text-[0.9em] font-semibold">{p.category}</span>}
          <Bubble big>{p.prompt}</Bubble>
          <p className="text-[0.9em] text-muted-foreground">Tulis di kolom komentar 👇</p>
        </>
      );
    case "chaos":
      return p.mode === "story" ? (
        <>
          <p className="font-display text-[1.2em] font-bold">Bikin cerita dari 3 kata ini!</p>
          <div className="flex flex-wrap justify-center gap-[0.6em]">
            {p.words.map((w, i) => (
              <span key={w} className="animate-pop-in rounded-[0.8em] px-[0.9em] py-[0.5em] font-display text-[1.6em] font-bold shadow-pop"
                style={{ animationDelay: `${i * 0.2}s`, background: ["var(--primary)", "var(--pop)", "var(--electric)"][i % 3] }}>{w}</span>
            ))}
          </div>
        </>
      ) : (
        <>
          <span className="font-display text-[1em] font-bold text-zest">MASALAH HARI INI</span>
          <Bubble>{p.problem}</Bubble>
          <ol className="w-full space-y-[0.4em] text-[1.05em]">
            {p.solutions.map((s, i) => <li key={s} className="rounded-[0.8em] bg-background/75 px-[1em] py-[0.5em]"><b className="text-zest">{i + 1}.</b> {s}</li>)}
          </ol>
        </>
      );
  }
}

function ThisOrThat({ a, b, end }: { a?: string | undefined; b?: string | undefined; end?: number | undefined }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [end]);
  return (
    <div className="flex w-full flex-col items-center gap-[0.8em]">
      <div className="w-full rounded-[1.2em] bg-primary p-[1em] text-center font-display text-[1.7em] font-bold shadow-glow">{a}</div>
      <div className="flex h-[2.6em] w-[2.6em] items-center justify-center rounded-full bg-zest font-display text-[1.1em] font-black text-background">
        {end && left > 0 ? left : "VS"}
      </div>
      <div className="w-full rounded-[1.2em] bg-electric p-[1em] text-center font-display text-[1.7em] font-bold text-background shadow-glow">{b}</div>
    </div>
  );
}

function VoteBar({ votes, labels }: { votes: { a: number; b: number }; labels: [string, string] }) {
  const total = votes.a + votes.b;
  const pa = total ? Math.round((votes.a / total) * 100) : 50;
  return (
    <div className="w-full">
      <div className="flex h-[1.8em] w-full overflow-hidden rounded-full border-[0.12em] border-background/60 bg-background/70">
        <div className="flex items-center justify-start bg-primary px-[0.6em] font-display text-[0.85em] font-bold transition-all duration-500" style={{ width: `${pa}%` }}>{pa}%</div>
        <div className="flex flex-1 items-center justify-end bg-electric px-[0.6em] font-display text-[0.85em] font-bold text-background">{100 - pa}%</div>
      </div>
      <div className="mt-[0.3em] flex justify-between text-[0.8em] font-semibold"><span>{labels[0]} · {votes.a}</span><span>{votes.b} · {labels[1]}</span></div>
    </div>
  );
}

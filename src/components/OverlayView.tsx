import { useEffect, useRef, type CSSProperties } from "react";
import type { OverlayState } from "@/lib/kyoka";
import { GIMMICKS } from "@/lib/kyoka";

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

export function OverlayView({ state, preview }: { state: OverlayState; preview?: boolean }) {
  const p = state.payload;
  const last = useRef(state.updatedAt);
  useEffect(() => {
    if (!preview && state.sound && state.updatedAt !== last.current && p) beep();
    last.current = state.updatedAt;
  }, [state.updatedAt, state.sound, p, preview]);

  const style = { "--ov": ACCENT[state.accent] ?? "var(--primary)", fontSize: `${state.textScale}em` } as CSSProperties;
  const g = p ? GIMMICKS.find((x) => x.id === p.gimmick) : null;

  return (
    <div style={style} className="relative flex h-full w-full flex-col items-center justify-center gap-[1.2em] p-[4%] text-foreground">
      {!state.visible ? null : !p ? (
        preview ? <p className="text-[0.9em] text-muted-foreground">Overlay kosong — kirim gimmick dari dashboard</p> : null
      ) : (
        <div key={state.updatedAt} className="animate-pop-in flex w-full flex-col items-center gap-[1em]">
          {state.showTitle && g && (
            <div className="rounded-full px-[1.2em] py-[0.4em] font-display text-[1.1em] font-bold shadow-pop" style={{ background: "var(--ov)" }}>
              {g.emoji} {g.name}
            </div>
          )}
          <Body state={state} />
          {state.showBadge && <div className="mt-[0.5em] font-display text-[0.7em] font-bold tracking-[0.3em] text-gradient">KYOKA LIVE</div>}
        </div>
      )}
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

import { useState } from "react";
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

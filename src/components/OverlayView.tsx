import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Intake, OverlayPayload, OverlayState } from "@/lib/kyoka";
import { DEFAULT_INTAKE, GIMMICKS } from "@/lib/kyoka";
import "./overlay.css";

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
  const fo = it.followersOnly ? ["🔒 Komentar khusus follower, follow dulu ya"] : [];
  switch (p.gimmick) {
    case "thisorthat": return ["Komen A atau B untuk vote", ...fo, ...link(it.thisorthat, "Usul pilihan lewat link di bio")];
    case "hottake": return ["Komen SETUJU atau TIDAK untuk vote", ...fo, ...link(it.hottake, "Kirim hot take lewat link di bio")];
    case "spin": return it.spin ? ["Ketik !spin lalu pertanyaanmu", ...fo] : [];
    case "confession": return link(it.confession, "Confess anonim lewat link di bio");
    case "chaos": return link(it.chaos, "Kirim 3 kata lewat link di bio");
    case "audience":
      return p.kind === "confession" ? link(it.confession, "Confess anonim lewat link di bio") : p.kind === "spin" ? link(it.spin, "Ketik !spin lalu pertanyaanmu") : [];
    default: return [];
  }
}
/** Ukuran teks menyesuaikan panjang isi supaya kiriman panjang tetap muat di zona aman. */
const fit = (t: string | undefined | null) => {
  const n = (t ?? "").length;
  return n <= 50 ? 1.9 : n <= 100 ? 1.55 : n <= 180 ? 1.28 : n <= 300 ? 1.08 : 0.92;
};
const COLORS = ["var(--primary)", "var(--pop)", "var(--electric)"];

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
  const lines = p && state.guidePos !== "off" ? guideLines(p, state.intake) : [];
  const pos = state.guidePos ?? "tr";
  const guide = state.visible && lines.length > 0 && (
    <div className={`ov-guide ${pos === "tl" || pos === "bl" ? "l" : "r"}`}>{lines.map((l) => <span key={l}>💬 {l}</span>)}</div>
  );
  const guideOnTop = pos === "tl" || pos === "tr";

  return (
    <div style={style} className="ov-root">
      <div className="ov-safe">
        {!state.visible ? null : !p ? (
          preview ? <p className="ov-idle">Overlay kosong. Kirim gimmick dari dashboard.</p> : null
        ) : (
          <>
            {guideOnTop && guide}
            <div key={state.payloadAt} className="ov-card">
              {(state.showTitle || state.showBadge) && (
                <div className="ov-head">
                  {state.showTitle && g ? <span className="ov-chip">{g.emoji} {g.name}</span> : <span />}
                  {state.showBadge && <span className="ov-brand">KYOKA LIVE</span>}
                </div>
              )}
              <Body state={state} />
            </div>
            {!guideOnTop && guide}
          </>
        )}
        {state.visible && bannerOn && state.banner && <div key={state.banner.at} className="ov-banner">{state.banner.text}</div>}
      </div>
    </div>
  );
}

function Quote({ text, quoted }: { text: string; quoted?: boolean }) {
  return <p className={`ov-quote${quoted ? " q" : ""}`} style={{ fontSize: `${fit(text)}em` }}>{text}</p>;
}

function Attribution({ name }: { name?: string | undefined }) {
  const n = name || "Anonim";
  return <span className={`ov-by${n.startsWith("⚡") ? " fast" : ""}`}>{n.startsWith("⚡") ? n : `— ${n}`}</span>;
}

function Body({ state }: { state: OverlayState }) {
  const p = state.payload!;
  switch (p.gimmick) {
    case "spin":
      return (
        <div className="ov-body">
          {p.spinning ? (
            <><div className="ov-emoji wiggle">🎡</div><span className="ov-muted">Memutar…</span></>
          ) : (
            <>{p.category && <span className="ov-chip soft">{p.category}</span>}<Quote text={p.question ?? ""} /></>
          )}
        </div>
      );
    case "thisorthat":
      return <ThisOrThat a={p.a} b={p.b} end={p.countdownEnd} votes={state.votes} />;
    case "hottake":
      return (
        <div className="ov-body">
          <div className="ov-emoji float">🔥</div>
          <Quote text={p.topic ?? ""} quoted />
          <Opts votes={state.votes} items={[{ key: "👍", label: "SETUJU", wide: true }, { key: "👎", label: "TIDAK", wide: true }]} />
          {p.followups?.length ? (
            <ul className="ov-list">{p.followups.map((f) => <li key={f}>💬 {f}</li>)}</ul>
          ) : null}
        </div>
      );
    case "card":
      return (
        <div className="ov-body">
          <div className="ov-cards">
            {Array.from({ length: p.count }).map((_, i) => <div key={i} className={`ov-pick${p.revealed === i ? " on" : ""}`}>{p.revealed === i ? "✦" : i + 1}</div>)}
          </div>
          {p.text && <Quote text={p.text ?? ""} />}
        </div>
      );
    case "audience":
      return (
        <div className="ov-body">
          <span className="ov-chip soft">{p.kind === "confession" ? "🤫 Confession anonim" : p.kind === "spin" ? "🎡 Pertanyaan dari penonton" : p.kind === "problem" ? "🌀 Masalah dari penonton" : "💬 Dari penonton"}</span>
          <Quote text={p.content ?? ""} quoted />
          <Attribution name={p.nickname} />
        </div>
      );
    case "confession":
      return (
        <div className="ov-body">
          <div className="ov-emoji">🤫</div>
          {p.category && <span className="ov-chip soft">{p.category}</span>}
          <Quote text={p.prompt ?? ""} />
        </div>
      );
    case "chaos":
      return p.mode === "story" ? (
        <div className="ov-body">
          <span className="ov-muted">Bikin cerita dari 3 kata ini!</span>
          <div className="ov-words">
            {p.words.map((w, i) => <div key={w} className="ov-word" style={{ animationDelay: `${i * 0.18}s`, background: COLORS[i % 3] }}>{w}</div>)}
          </div>
        </div>
      ) : (
        <div className="ov-body">
          <span className="ov-chip soft">MASALAH HARI INI</span>
          <Quote text={p.problem ?? ""} />
          <ol className="ov-list">{p.solutions.map((s, i) => <li key={s}><b>{i + 1}.</b>{s}</li>)}</ol>
        </div>
      );
  }
}

type OptItem = { key: string; label: string; wide?: boolean };
/** Dua pilihan dengan isi warna menurut persentase vote. */
function Opts({ votes, items }: { votes: { a: number; b: number } | undefined; items: [OptItem, OptItem] | OptItem[] }) {
  const a = votes?.a ?? 0; const b = votes?.b ?? 0; const total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 0;
  const pcts = [pa, total ? 100 - pa : 0];
  const counts = [a, b];
  const cols = ["var(--primary)", "var(--electric)"];
  return (
    <div className="ov-opts">
      {items.slice(0, 2).map((it, i) => (
        <div key={i} className={`ov-opt${total && pcts[i]! > pcts[1 - i]! ? " win" : ""}`} style={{ "--c": cols[i], "--pct": `${pcts[i]}%` } as CSSProperties}>
          <span className={`ov-key${it.wide ? " wide" : ""}`}>{it.key}</span>
          <span className="ov-opt-text" style={{ fontSize: `${fit(it.label) * 0.62}em` }}>{it.label}</span>
          <span className="ov-pct" style={{ fontSize: "1.5em" }}>{pcts[i]}%<small>{counts[i]} suara</small></span>
        </div>
      ))}
    </div>
  );
}

function ThisOrThat({ a, b, end, votes }: { a?: string | undefined; b?: string | undefined; end?: number | undefined; votes: { a: number; b: number } | undefined }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!end) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [end]);
  const a0 = votes?.a ?? 0; const b0 = votes?.b ?? 0; const total = a0 + b0;
  const pa = total ? Math.round((a0 / total) * 100) : 0;
  const pcts = [pa, total ? 100 - pa : 0];
  const opt = (i: 0 | 1, key: string, text: string | undefined, c: string) => (
    <div className={`ov-opt${total && pcts[i]! > pcts[1 - i]! ? " win" : ""}`} style={{ "--c": c, "--pct": `${pcts[i]}%` } as CSSProperties}>
      <span className="ov-key">{key}</span>
      <span className="ov-opt-text" style={{ fontSize: `${fit(text) * 0.78}em` }}>{text}</span>
      <span className="ov-pct" style={{ fontSize: "1.5em" }}>{pcts[i]}%<small>{i === 0 ? a0 : b0} suara</small></span>
    </div>
  );
  return (
    <div className="ov-body">
      <div className="ov-opts">
        {opt(0, "A", a, "var(--primary)")}
        <div className={`ov-vs${end && left > 0 && left <= 3 ? " urgent" : ""}`}>{end && left > 0 ? left : "VS"}</div>
        {opt(1, "B", b, "var(--electric)")}
      </div>
      <div className="ov-foot"><span className="ov-hint">Komen <b>A</b> atau <b>B</b> untuk vote 🗳️</span></div>
    </div>
  );
}

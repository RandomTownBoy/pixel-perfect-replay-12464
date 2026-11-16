import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardPayload, Intake, OverlayPayload, OverlayState, SpinPayload } from "@/lib/kyoka";
import { DEFAULT_INTAKE, DEMO, GIMMICKS } from "@/lib/kyoka";
import { SpinWheelSvg, wheelColor } from "@/components/SpinWheel";
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
    case "card": return link(it.card, "Kirim isi kartu lewat link di bio");
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
  // Slot panduan selalu ada (tinggi tetap) supaya kartu tidak bergeser naik-turun antar gimmick.
  const guide = state.visible && !!p && state.guidePos !== "off" && (
    <div className={`ov-guide-slot ${pos === "tl" || pos === "bl" ? "l" : "r"}`}>
      {lines.length > 0 && <div className="ov-guide">{lines.map((l) => <span key={l}>💬 {l}</span>)}</div>}
    </div>
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
            <div key={state.payloadAt} className="ov-card" data-g={p.gimmick === "chaos" ? `chaos-${p.mode}` : p.gimmick} data-phase={"phase" in p ? p.phase : undefined}>
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

function Quote({ text, quoted, max }: { text: string; quoted?: boolean; max?: number }) {
  return <p className={`ov-quote${quoted ? " q" : ""}`} style={{ fontSize: `${Math.min(fit(text), max ?? 99)}em` }}>{text}</p>;
}

function Attribution({ name }: { name?: string | undefined }) {
  const n = name || "Anonim";
  return <span className={`ov-by${n.startsWith("⚡") ? " fast" : ""}`}>{n.startsWith("⚡") ? n : `— ${n}`}</span>;
}

function Body({ state }: { state: OverlayState }) {
  const p = state.payload!;
  switch (p.gimmick) {
    case "spin":
      if (p.phase) return <SpinStage p={p} />;
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
          <Quote text={p.topic ?? ""} quoted max={1.45} />
          <Opts votes={state.votes} items={[{ key: "👍", label: "SETUJU", wide: true }, { key: "👎", label: "TIDAK", wide: true }]} />
          {p.followups?.length ? (
            <ul className="ov-list">{p.followups.slice(0, 2).map((f) => <li key={f}>💬 {f}</li>)}</ul>
          ) : null}
        </div>
      );
    case "card":
      if (p.phase) return <CardStage p={p} />;
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
          <span className="ov-muted">{p.rolling ? "Mengacak kata…" : "Bikin cerita dari 3 kata ini!"}</span>
          <ChaosWords words={p.words} rolling={!!p.rolling} />
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

/* ---------- Spin the Question: roda tampil di overlay ---------- */

/** Easing cubic-bezier (sama dengan CSS) supaya animasi bisa dilanjutkan dari tengah setelah overlay di-refresh. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u;
  const Y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - t;
      if (Math.abs(e) < 1e-5) break;
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-4) {
      let lo = 0, hi = 1; u = t;
      for (let i = 0; i < 30; i++) { const v = X(u); if (Math.abs(v - t) < 1e-5) break; if (v < t) lo = u; else hi = u; u = (lo + hi) / 2; }
    }
    return Y(u);
  };
}
const SPIN_EASE = bezier(0.15, 0.85, 0.2, 1);

/** Sudut roda pada waktu `now`: sudah lewat durasi → langsung sudut akhir; masih jalan → posisi sisa animasinya. */
function wheelAngleAt(p: SpinPayload, now: number): number {
  const to = p.rotation ?? 0;
  if (p.phase !== "spinning" || p.startedAt === undefined || !p.durationMs) return to;
  const t = (now - p.startedAt) / p.durationMs;
  if (t >= 1) return to;
  const from = p.fromRotation ?? 0;
  return from + (to - from) * SPIN_EASE(Math.max(0, t));
}

function useWheelAngle(p: SpinPayload) {
  const [angle, setAngle] = useState(() => wheelAngleAt(p, Date.now()));
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const now = Date.now();
      setAngle(wheelAngleAt(p, now));
      if (p.phase === "spinning" && p.startedAt !== undefined && !!p.durationMs && now - p.startedAt < p.durationMs) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.phase, p.rotation, p.fromRotation, p.startedAt, p.durationMs]);
  return angle;
}

/** True selama `ms` setelah waktu `at` (dipakai untuk chip sementara). */
function useFlash(at: number | undefined, ms: number) {
  const [on, setOn] = useState(() => at !== undefined && Date.now() - at < ms);
  useEffect(() => {
    if (at === undefined) { setOn(false); return; }
    const left = ms - (Date.now() - at);
    if (left <= 0) { setOn(false); return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), left);
    return () => clearTimeout(t);
  }, [at, ms]);
  return on;
}

function SpinStage({ p }: { p: SpinPayload }) {
  const items = p.items ?? [];
  const n = items.length;
  const phase = p.phase ?? "standby";
  const angle = useWheelAngle(p);
  const flash = useFlash(p.addedAt, 3000);
  const winner = phase === "result" ? p.winnerIndex : undefined;
  const fresh = new Set(p.addedAt !== undefined && Date.now() - p.addedAt < 3500 ? p.added ?? [] : []);
  const dense = n > 3;
  return (
    <div className={`ov-body ov-spin${dense ? " dense" : ""}${phase === "result" ? " res" : ""}`}>
      <div className="ov-spin-top">
        {p.category && <span className="ov-chip soft">{p.category}</span>}
        {flash && <span className="ov-chip add">➕ Ditambahkan ke roda</span>}
      </div>
      <div className="ov-wheelwrap">
        <span className="ov-pointer" />
        <SpinWheelSvg count={n} winner={winner} className="ov-wheel" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      {n === 0 ? (
        <p className="ov-empty">Roda masih kosong, ketik !spin lalu pertanyaanmu</p>
      ) : (
        <ol className={`ov-items${dense ? " two" : ""}`}>
          {items.map((t, i) => (
            <li key={t} title={t} className={`ov-item${winner === undefined ? "" : i === winner ? " win" : " dim"}${fresh.has(t) ? " fresh" : ""}`}>
              <b style={{ background: wheelColor(i) }}>{i + 1}</b><span>{t}</span>
            </li>
          ))}
        </ol>
      )}
      {phase === "spinning" && <span className="ov-muted">Memutar…</span>}
      {phase === "result" && p.question && (
        <div key={p.question} className="ov-result animate-pop-in" style={{ animationDelay: "0.35s" }}>
          <Quote text={p.question} max={1.5} />
        </div>
      )}
    </div>
  );
}

/* ---------- Pick a Card: kartu tertutup → kocok → bagi → balik ---------- */

function CardStage({ p }: { p: CardPayload }) {
  const phase = p.phase ?? "standby";
  const n = Math.max(0, Math.min(6, p.count));
  const rows = Math.ceil(n / 3) || 1;
  const revealed = phase === "revealed" ? p.revealed : undefined;
  return (
    <div className="ov-body">
      <div className={`ov-deck ${phase}`}>
        {Array.from({ length: n }).map((_, i) => {
          const row = Math.floor(i / 3);
          const inRow = Math.min(3, n - row * 3);
          const dx = -((i % 3) - (inRow - 1) / 2); // arah ke tengah tumpukan
          const dy = (rows - 1) / 2 - row;
          const on = revealed === i;
          const dim = revealed !== undefined && !on;
          return (
            <div key={i} className={`flip-card ov-fc${on ? " on" : ""}${dim ? " dim" : ""}`}
              style={{ "--dx": dx, "--dy": dy, "--r": ((i * 7) % 9) - 4, "--i": i } as CSSProperties}>
              <div className={`flip-inner${on ? " flipped" : ""}`}>
                <div className="flip-face ov-face front">{i + 1}</div>
                <div className="flip-face flip-back ov-face back">✦</div>
              </div>
            </div>
          );
        })}
      </div>
      {phase === "shuffling" && <span className="ov-muted">Mengocok kartu…</span>}
      {(phase === "standby" || phase === "dealt") && <span className="ov-prompt">Pilih satu kartu!</span>}
      {phase === "revealed" && p.text && (
        <div key={p.text} className="ov-result animate-pop-in" style={{ animationDelay: "0.55s" }}>
          <Quote text={p.text} max={1.45} />
        </div>
      )}
    </div>
  );
}

/* ---------- Random Chaos (cerita): kata digulir dulu, lalu berhenti ---------- */

function ChaosWords({ words, rolling }: { words: string[]; rolling: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setTick((x) => x + 1), 90);
    return () => clearInterval(t);
  }, [rolling]);
  const pool = DEMO.words;
  return (
    <div className="ov-words">
      {words.map((w, i) => rolling
        ? <div key={`roll-${i}`} className="ov-word roll" style={{ background: COLORS[i % 3] }}>{pool[(tick * (i + 3) + i * 7) % pool.length]}</div>
        : <div key={w} className="ov-word" style={{ animationDelay: `${i * 0.18}s`, background: COLORS[i % 3] }}>{w}</div>)}
    </div>
  );
}

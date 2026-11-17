import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CardPayload, Intake, Outro, OverlayPayload, OverlayState, SpinPayload } from "@/lib/kyoka";
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
    case "spin": return it.spin ? ["Kirim lewat link bio atau ketik !spin + pertanyaan", ...fo] : [];
    case "confession": return link(it.confession, "Confess anonim lewat link di bio");
    case "card": return link(it.card, "Kirim isi kartu lewat link di bio");
    case "chaos": return link(it.chaos, "Kirim 3 kata lewat link di bio");
    case "audience":
      return p.kind === "confession" ? link(it.confession, "Confess anonim lewat link di bio") : p.kind === "spin" || p.kind === "question" ? link(it.spin, "Kirim lewat link bio atau ketik !spin") : [];
    default: return [];
  }
}
/** Ukuran teks menyesuaikan panjang isi supaya kiriman panjang tetap muat di zona aman. */
const fit = (t: string | undefined | null) => {
  const n = (t ?? "").length;
  return n <= 50 ? 1.9 : n <= 100 ? 1.55 : n <= 180 ? 1.28 : n <= 300 ? 1.08 : 0.92;
};
const COLORS = ["var(--primary)", "var(--pop)", "var(--electric)"];

/** Lebar tumpukan overlay (px) pada skala 1 (≈ 26em). Tinggi mengikuti isi; skala akhir dihitung supaya pas di area aman. */
const DESIGN_W = 420;
const SPIN_WIDE_W = 540; // Spin the Question di sumber lebar: tumpukan lebih lebar supaya kartu mengisi kiri-kanan
const MAX_SCALE = 4;
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Mengukur area aman (.ov-safe) dan tinggi asli isi (.ov-stage), lalu mengembalikan skala supaya isi selalu muat utuh,
 * berapa pun ukuran/rasio sumber overlay (OBS, TikTok LIVE Studio, pratinjau). Menggantikan max-height + overflow: hidden
 * yang dulu memotong kartu Hot Take, Spin, Pick a Card, This or That dan Random Chaos.
 */
function useFit(gimmick?: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState({ scale: 1, ready: false, dw: DESIGN_W });
  useIsoLayoutEffect(() => {
    const measure = () => {
      const r = rootRef.current, sf = safeRef.current, st = stageRef.current;
      if (!r || !sf || !st) return;
      const w = r.clientWidth, h = r.clientHeight;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      const aw = sf.clientWidth, ah = sf.clientHeight, nh = st.offsetHeight; // offsetHeight tidak terpengaruh transform
      if (!aw || !ah || !nh) return;
      const dw = w / h >= 1 && gimmick === "spin" ? SPIN_WIDE_W : DESIGN_W;
      const scale = Math.max(0.05, Math.min(aw / dw, ah / nh, MAX_SCALE));
      setFit((f) => (f.ready && f.dw === dw && Math.abs(f.scale - scale) < 0.002 ? f : { scale, ready: true, dw }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    [rootRef.current, safeRef.current, stageRef.current].forEach((el) => el && ro?.observe(el));
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [gimmick]);
  return { rootRef, safeRef, stageRef, box, ...fit };
}

/** auto = zona aman TikTok hanya kalau sumbernya portrait penuh (≈ 9:16); tiktok = selalu; off = hampir seluruh area dipakai. */
export type SafeMode = "auto" | "tiktok" | "off";

export function OverlayView({ state, preview, safe = "auto" }: { state: OverlayState; preview?: boolean; safe?: SafeMode }) {
  const p = state.payload;
  const { rootRef, safeRef, stageRef, box, scale, ready, dw } = useFit(p?.gimmick);
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

  const style = { "--ov": ACCENT[state.accent] ?? "var(--primary)", fontSize: `${16 * (state.textScale || 1)}px` } as CSSProperties;
  // Portrait penuh (9:16): sisakan atas (profil/penonton) & bawah (komentar/gift) TikTok. Sumber kotak/landscape: pakai hampir seluruh area.
  const portraitFull = box.w > 0 && box.h > 0 && box.w / box.h <= 0.66;
  const tiktokSafe = safe === "tiktok" || (safe === "auto" && portraitFull);
  const inset = tiktokSafe ? "11% 5% 36% 5%" : "3% 4% 3% 4%";
  const stageStyle = { width: dw, marginLeft: -dw / 2, transform: `scale(${scale})`, opacity: ready ? 1 : 0 } as CSSProperties;
  const g = p ? GIMMICKS.find((x) => x.id === p.gimmick) : null;
  // Animasi penutup hanya berlaku untuk payload yang sedang tayang (payload baru otomatis menghapusnya).
  const outro = state.outro && state.outro.at >= state.payloadAt ? state.outro : undefined;
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
    <div ref={rootRef} style={style} className="ov-root" data-wide={box.w > 0 && box.w / box.h >= 1 ? "" : undefined}>
      <div ref={safeRef} className="ov-safe" style={{ inset }}>
        <div ref={stageRef} className="ov-stage" style={stageStyle}>
          {!state.visible ? null : !p ? (
            preview ? <p className="ov-idle">Overlay kosong. Kirim gimmick dari dashboard.</p> : null
          ) : (
            <>
              {guideOnTop && guide}
              <div key={state.payloadAt} className="ov-card" data-g={p.gimmick === "chaos" ? `chaos-${p.mode}` : p.gimmick} data-phase={"phase" in p ? p.phase : undefined} data-outro={outro ? "" : undefined}>
                {(state.showTitle || state.showBadge) && (
                  <div className="ov-head">
                    {state.showTitle && g ? <span className="ov-chip">{g.emoji} {g.name}</span> : <span />}
                    {state.showBadge && <span className="ov-brand">KYOKA LIVE</span>}
                  </div>
                )}
                <Body state={state} outro={outro} />
                {outro && <OutroLayer p={p} outro={outro} />}
                {state.queue && state.queue.pending > 0 && !outro && <QueueBar q={state.queue} />}
              </div>
              {!guideOnTop && guide}
            </>
          )}
        </div>
        {/* Banner gift di luar tumpukan: muncul tanpa mengubah ukuran kartu (kalau tidak, kartu ikut mengecil tiap ada gift). */}
        {state.visible && bannerOn && state.banner && (
          <div className="ov-banner-wrap" style={{ width: dw, marginLeft: -dw / 2, transform: `scale(${scale})`, opacity: ready ? 1 : 0 }}>
            <div key={state.banner.at} className="ov-banner">{state.banner.text}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const HOT_MS = 8000; // sisa waktu ini: garis mulai berdenyut
/** Garis loading di tepi bawah kartu: bergerak kiri→kanan selama item tayang, hanya selama masih ada antrean (hilang saat habis). */
function QueueBar({ q }: { q: NonNullable<OverlayState["queue"]> }) {
  const paused = q.pausedAt !== undefined;
  const elapsed = useMemo(() => Math.min(q.ms, Math.max(0, (q.pausedAt ?? Date.now()) - q.startedAt)), [q.ms, q.pausedAt, q.startedAt]);
  return (
    <div className="ov-queue" data-paused={paused ? "" : undefined} aria-hidden>
      <i key={`${q.startedAt}-${paused ? "p" : "r"}`} style={{ animationDuration: `${q.ms}ms, 1s`, animationDelay: `${-elapsed}ms, ${q.ms - HOT_MS - elapsed}ms` }} />
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

function Body({ state, outro }: { state: OverlayState; outro?: Outro | undefined }) {
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
      return <ThisOrThat a={p.a} b={p.b} end={p.countdownEnd} votes={outro?.votes ?? state.votes} outro={!!outro} />;
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

function ThisOrThat({ a, b, end, votes, outro }: { a?: string | undefined; b?: string | undefined; end?: number | undefined; votes: { a: number; b: number } | undefined; outro?: boolean }) {
  const [left, setLeft] = useState(0);
  const [over, setOver] = useState(() => !!end && Date.now() >= end);
  useEffect(() => {
    if (!end) { setOver(false); return; }
    const tick = () => { setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))); setOver(Date.now() >= end); };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [end]);
  // Hasil keluar kalau countdown habis (dikirim manual) atau waktu tayang antrean habis (outro dari dashboard).
  const resolved = !!outro || over;
  const a0 = votes?.a ?? 0; const b0 = votes?.b ?? 0; const total = a0 + b0;
  const pa = total ? Math.round((a0 / total) * 100) : 0;
  const pcts = [pa, total ? 100 - pa : 0];
  const champ = resolved && total ? (a0 > b0 ? 0 : b0 > a0 ? 1 : -1) : -1;
  const tie = resolved && total > 0 && a0 === b0;
  const opt = (i: 0 | 1, key: string, text: string | undefined, c: string) => (
    <div className={`ov-opt${total && pcts[i]! > pcts[1 - i]! ? " win" : ""}${champ === i ? " champ" : ""}${champ === 1 - i ? " lose" : ""}${tie ? " tied" : ""}`} style={{ "--c": c, "--pct": `${pcts[i]}%` } as CSSProperties}>
      <span className="ov-key">{champ === i ? <span className="ov-crown">👑</span> : key}</span>
      <span className="ov-opt-text" style={{ fontSize: `${fit(text) * 0.78}em` }}>{text}</span>
      <span className="ov-pct" style={{ fontSize: "1.5em" }}>{pcts[i]}%<small>{i === 0 ? a0 : b0} suara</small></span>
    </div>
  );
  const winnerText = champ === 0 ? a : champ === 1 ? b : undefined;
  return (
    <div className={`ov-body${resolved ? " resolved" : ""}`}>
      <div className="ov-opts">
        {opt(0, "A", a, "var(--primary)")}
        <div className={`ov-vs${!resolved && end && left > 0 && left <= 3 ? " urgent" : ""}${resolved ? " done" : ""}`}>{resolved ? (tie ? "=" : total ? "🏆" : "?") : end && left > 0 ? left : "VS"}</div>
        {opt(1, "B", b, "var(--electric)")}
      </div>
      {resolved && champ >= 0 && <Burst emoji={["🎉", "✨", "👑", "🎊"]} n={16} />}
      <div className="ov-foot">
        {resolved
          ? <span key="res" className="ov-hint ov-verdict">{tie ? "⚖️ Seri! Penonton terbelah dua" : total ? <>🏆 Pilihan penonton: <b>{winnerText}</b></> : "🤷 Belum ada yang vote"}</span>
          : <span className="ov-hint">Komen <b>A</b> atau <b>B</b> untuk vote 🗳️</span>}
      </div>
    </div>
  );
}

/* ---------- Animasi penutup (setelah waktu tayang habis, sebelum item antrean berikutnya) ---------- */

/** Ledakan emoji dari tengah kartu. Murni CSS; posisi tiap partikel ditentukan indeksnya supaya konsisten. */
function Burst({ emoji, n = 14 }: { emoji: string[]; n?: number }) {
  return (
    <div className="ov-burst" aria-hidden>
      {Array.from({ length: n }).map((_, i) => {
        const ang = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
        const d = 4.2 + (i % 3) * 1.5;
        return <i key={i} style={{ "--bx": `${(Math.cos(ang) * d).toFixed(2)}em`, "--by": `${(Math.sin(ang) * d * 0.8).toFixed(2)}em`, "--bd": `${(i % 6) * 0.05}s`, "--br": `${(i * 53) % 360}deg` } as CSSProperties}>{emoji[i % emoji.length]}</i>;
      })}
    </div>
  );
}

/** Lapisan animasi di atas kartu. This or That tidak memakainya (hasilnya tampil langsung di pilihan A/B). */
function OutroLayer({ p, outro }: { p: OverlayPayload; outro: Outro }) {
  const style = { "--oms": `${outro.ms}ms` } as CSSProperties;
  const more = !outro.fade;
  const cls = `ov-outro${outro.fade ? " fade" : ""}`;
  if (p.gimmick === "hottake") return <div className={`${cls} hot`} style={style}><HotOutro votes={outro.votes} /></div>;
  if (p.gimmick === "confession" || (p.gimmick === "audience" && p.kind === "confession")) return <div className={`${cls} conf`} style={style}><ConfessionOutro more={more} /></div>;
  if (p.gimmick === "chaos") return <div className={`${cls} chaos`} style={style}><ChaosOutro more={more} /></div>;
  return null;
}

/** Hot Take: meteran setuju/tidak terisi, lalu cap hasil menghantam layar. */
function HotOutro({ votes }: { votes: { a: number; b: number } | undefined }) {
  const a = votes?.a ?? 0; const b = votes?.b ?? 0; const total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 0;
  const pb = total ? 100 - pa : 0;
  const kind = !total ? "none" : a > b ? "agree" : b > a ? "disagree" : "tie";
  const V = {
    agree: { icon: "👍", text: "SETUJU!", sub: "Penonton setuju", burst: ["👍", "🔥", "✨", "💯"] },
    disagree: { icon: "👎", text: "TIDAK SETUJU!", sub: "Penonton menolak", burst: ["👎", "💥", "😤", "🙅"] },
    tie: { icon: "⚖️", text: "SERI!", sub: "Penonton terbelah dua", burst: ["⚖️", "🤝", "😮"] },
    none: { icon: "🤷", text: "BELUM ADA SUARA", sub: "Sepi nih…", burst: [] as string[] },
  }[kind];
  return (
    <div className={`ov-hot ${kind}`}>
      <div className="ov-meter">
        <div className="ov-meter-row agree"><span>👍 Setuju</span><div className="ov-meter-bar"><i style={{ "--w": `${pa}%` } as CSSProperties} /></div><b>{pa}%</b></div>
        <div className="ov-meter-row disagree"><span>👎 Tidak</span><div className="ov-meter-bar"><i style={{ "--w": `${pb}%` } as CSSProperties} /></div><b>{pb}%</b></div>
      </div>
      <div className="ov-stamp"><span className="ov-stamp-icon">{V.icon}</span><span className="ov-stamp-text">{V.text}</span></div>
      <span className="ov-outro-sub">{total ? `${a} setuju · ${b} tidak · ${V.sub}` : V.sub}</span>
      {V.burst.length > 0 && <Burst emoji={V.burst} n={14} />}
    </div>
  );
}

/** Confession: segel kunci menghantam kartu, gelombang riak, lalu rahasia "disimpan". */
function ConfessionOutro({ more }: { more: boolean }) {
  return (
    <div className="ov-conf-out">
      <div className="ov-seal-wrap">
        <i className="ov-ripple" /><i className="ov-ripple r2" /><i className="ov-ripple r3" />
        <div className="ov-seal"><span>🔒</span></div>
      </div>
      <p className="ov-conf-title">Rahasia aman di sini</p>
      <span className="ov-outro-sub">{more ? <>Rahasia berikutnya<span className="ov-dots" /></> : "Terima kasih sudah jujur 🤫"}</span>
      <div className="ov-rise" aria-hidden>{["🤫", "✨", "🤐", "💜", "🤫", "✨"].map((e, i) => <i key={i} style={{ "--rx": `${(i - 2.5) * 1.5}em`, "--rd": `${0.5 + i * 0.18}s` } as CSSProperties}>{e}</i>)}</div>
    </div>
  );
}

/** Random Chaos: pusaran menyedot kartu, tulisan glitch, lalu melebar menutupi layar sebagai transisi. */
function ChaosOutro({ more }: { more: boolean }) {
  return (
    <div className="ov-chaos-out">
      <div className="ov-vortex"><i /><i /><i /></div>
      <span className="ov-vortex-eye">🌀</span>
      <p className="ov-glitch" data-t={more ? "CHAOS BERIKUTNYA!" : "CHAOS SELESAI!"}>{more ? "CHAOS BERIKUTNYA!" : "CHAOS SELESAI!"}</p>
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
      <div className="ov-spin-main">
        <div className="ov-wheelwrap">
          <span className="ov-pointer" />
          <SpinWheelSvg count={n} winner={winner} className="ov-wheel" style={{ transform: `rotate(${angle}deg)` }} />
        </div>
        <div className="ov-spin-side">
          {n === 0 ? (
            <p className="ov-empty">Roda masih kosong, ketik !spin lalu pertanyaanmu</p>
          ) : (
            <ol className={`ov-items${dense ? " two" : ""}${n > 6 ? " many" : ""}`}>
              {items.map((t, i) => (
                <li key={t} title={t} className={`ov-item${winner === undefined ? "" : i === winner ? " win" : " dim"}${fresh.has(t) ? " fresh" : ""}`}>
                  <b style={{ background: wheelColor(i) }}>{i + 1}</b><span>{t}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
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
  const showRevealed = phase === "revealed";
  const opened = p.opened ?? (showRevealed && p.revealed !== undefined ? [p.revealed] : []); // deck yang sebagian sudah terbuka tampil dengan kartu terbukanya sejak standby
  const finished = n > 0 && opened.length >= n;
  return (
    <div className="ov-body">
      <div className={`ov-deck ${phase}`}>
        {Array.from({ length: n }).map((_, i) => {
          const row = Math.floor(i / 3);
          const inRow = Math.min(3, n - row * 3);
          const dx = -((i % 3) - (inRow - 1) / 2); // arah ke tengah tumpukan
          const dy = (rows - 1) / 2 - row;
          const isOpen = opened.includes(i);
          const on = showRevealed && p.revealed === i; // kartu terbaru
          const done = isOpen && !on; // sudah dibuka sebelumnya: tetap terbuka
          return (
            <div key={i} className={`flip-card ov-fc${on ? " on" : ""}${done ? " done" : ""}`}
              style={{ "--dx": dx, "--dy": dy, "--r": ((i * 7) % 9) - 4, "--i": i } as CSSProperties}>
              <div className={`flip-inner${isOpen ? " flipped" : ""}`}>
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
      {finished && <span className="ov-muted">✨ Semua kartu terbuka · deck selesai</span>}
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

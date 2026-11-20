import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { CardPayload, Intake, Outro, OverlayPayload, OverlayState, SpinPayload } from "@/lib/kyoka";
import { DEFAULT_INTAKE, DEMO, GIMMICKS } from "@/lib/kyoka";
import { SpinWheelSvg, wheelColor } from "@/components/SpinWheel";
import { sfx, setSfxEnabled, unlockSfx, probeSfx, resumeSfx, sfxBlocked, subscribeSfxBlocked } from "@/lib/sfx";
import "./overlay.css";

const ACCENT: Record<string, string> = { purple: "var(--primary)", blue: "var(--electric)", pink: "var(--pop)", yellow: "var(--zest)" };

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
  // Suara aktif hanya di overlay sungguhan (bukan pratinjau dashboard) dan kalau pengaturan "Efek suara" menyala.
  // Diatur saat render supaya efek anak komponen (yang jalan lebih dulu dari efek induk) sudah memakai nilai terbaru.
  setSfxEnabled(!preview && !!state.sound);
  useEffect(() => { unlockSfx(); }, []);
  const wantSound = !preview && !!state.sound;
  useEffect(() => { if (wantSound) probeSfx(); }, [wantSound]);
  const blocked = useSyncExternalStore(subscribeSfxBlocked, sfxBlocked, () => false);
  // OBS Browser Source tidak memblokir audio, jadi tombolnya cuma muncul di browser/aplikasi lain yang memblokir.
  const inObs = typeof window !== "undefined" && "obsstudio" in window;
  const showSoundPill = wantSound && blocked && !inObs;
  const last = useRef(state.payloadAt);
  useEffect(() => {
    if (state.payloadAt !== last.current && p) sfx.enter(p.gimmick);
    last.current = state.payloadAt;
  }, [state.payloadAt, state.sound, p, preview]);
  useVoteSfx(state.votes, state.payloadAt);
  // Transisi saat jenis gimmick berganti (bukan saat item berikutnya dari gimmick yang sama): sapuan warna + emoji dan nama gimmick, singkat (~1,3 dtk).
  const gKey = !p ? null : p.gimmick === "audience" ? (p.kind === "confession" ? "confession" : p.kind === "problem" ? "chaos" : p.kind === "spin" || p.kind === "question" ? "spin" : "audience") : p.gimmick;
  const prevKey = useRef<string | null>(gKey);
  const [sw, setSw] = useState<{ key: string; at: number } | null>(null);
  useEffect(() => {
    const before = prevKey.current;
    prevKey.current = gKey;
    if (!gKey || !before || before === gKey || !state.visible) return;
    setSw({ key: gKey, at: Date.now() });
    sfx.swoosh();
    const t = setTimeout(() => setSw(null), 1300);
    return () => clearTimeout(t);
  }, [gKey, state.visible]);
  const swInfo = sw ? GIMMICKS.find((x) => x.id === sw.key) : null;
  const [bannerOn, setBannerOn] = useState(false);
  useEffect(() => {
    if (!state.banner || Date.now() - state.banner.at > 8000) return;
    setBannerOn(true);
    sfx.gift();
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
                {!outro && (state.queue && state.queue.pending > 0 ? <QueueBar q={state.queue} /> : <IdleBar />)}
              </div>
              {!guideOnTop && guide}
              {sw && swInfo && (
                <div key={sw.at} className="ov-switch" data-g={sw.key} aria-hidden>
                  <span className="ov-switch-emoji">{swInfo.emoji}</span>
                  <span className="ov-switch-name">{swInfo.name}</span>
                </div>
              )}
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
      {showSoundPill && <button type="button" className="ov-sound-pill" onClick={() => void resumeSfx()}>🔊 Klik untuk aktifkan suara</button>}
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

/** Satu lapis gelombang sinyal: dua periode berurutan (lebar 800) supaya bisa digeser mulus selama satu periode (400). `c` = jumlah siklus per 400. */
function wavePath(amp: number, c: number, ph: number) {
  let d = "";
  for (let x = 0; x <= 800; x += 8) d += `${x ? "L" : "M"}${x} ${(20 + amp * Math.sin((2 * Math.PI * c * x) / 400 + ph)).toFixed(2)}`;
  return d;
}
const IDLE_WAVES = [
  { d: wavePath(10, 1, 0), color: "var(--primary)", dur: 11, breathe: 4.2, rev: false },
  { d: wavePath(8, 2, 1.6), color: "var(--electric)", dur: 8, breathe: 3.1, rev: true },
  { d: wavePath(6, 3, 3.1), color: "var(--pop)", dur: 6, breathe: 2.6, rev: false },
];
/** Bintang kecil yang naik & berkelip. Tetap (tanpa Math.random) supaya render stabil. */
const IDLE_SPARKS = Array.from({ length: 18 }, (_, i) => ({ x: (i * 37 + 9) % 96 + 2, dur: 6 + ((i * 13) % 7), delay: -((i * 17) % 11), sz: 0.38 + ((i * 7) % 5) * 0.13 }));

/** Antrean kosong: tidak ada progres lagi, jadi kartu dibuat "hidup" — aurora mengalir di belakang konten, bintang naik berkelip, kilau kaca menyapu,
 *  gelombang sinyal neon di dasar, dan dua komet berputar di tepi. Semuanya dikurung di dalam kotak kartu (overflow hidden) dan ada di belakang teks. */
function IdleBar() {
  return (
    <>
      <div className="ov-fx" aria-hidden>
        <b className="aur a" /><b className="aur b" /><b className="aur c" />
        {IDLE_SPARKS.map((sp, i) => (
          <i key={i} className="sp" style={{ left: `${sp.x}%`, "--d": `${sp.dur}s`, "--dl": `${sp.delay}s`, "--sz": `${sp.sz}em` } as CSSProperties} />
        ))}
        <div className="shine" />
        <div className="wave">
          {IDLE_WAVES.map((w, i) => (
            <div key={i} className="wv" style={{ "--bd": `${w.breathe}s`, "--wc": w.color } as CSSProperties}>
              <svg viewBox="0 0 800 40" preserveAspectRatio="none" style={{ animationDuration: `${w.dur}s`, animationDirection: w.rev ? "reverse" : "normal" }}>
                <path d={w.d} fill="none" stroke={w.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              </svg>
            </div>
          ))}
        </div>
      </div>
      <div className="ov-idle-ring" aria-hidden><i /></div>
    </>
  );
}

/** Pop naik nada tiap ada vote baru; vote beruntun (jeda < 2,5 dtk) membuat nadanya terus naik. Tidak berbunyi untuk vote lama saat overlay dimuat. */
function useVoteSfx(votes: { a: number; b: number } | undefined, key: number) {
  const prev = useRef({ key, n: (votes?.a ?? 0) + (votes?.b ?? 0) });
  const streak = useRef({ n: 0, at: 0 });
  useEffect(() => {
    const n = (votes?.a ?? 0) + (votes?.b ?? 0);
    if (prev.current.key !== key) { prev.current = { key, n }; streak.current = { n: 0, at: 0 }; return; }
    const d = n - prev.current.n;
    prev.current.n = n;
    if (d <= 0) return;
    const now = Date.now();
    streak.current.n = now - streak.current.at < 2500 ? streak.current.n + d : 0;
    streak.current.at = now;
    sfx.vote(streak.current.n, d);
  }, [votes?.a, votes?.b, key]);
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
      return p.kind === "confession" ? (
        <Teaser at={state.payloadAt} emoji="🤫" label="Ada confession baru">
          <div className="ov-body">
            <span className="ov-chip soft">🤫 Confession anonim</span>
            <Quote text={p.content ?? ""} quoted />
            <Attribution name={p.nickname} />
          </div>
        </Teaser>
      ) : (
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

/**
 * Sisi yang baru saja menyalip (0/1) selama ~2,6 detik, atau -1.
 * Menyalip hanya dihitung kalau selisih ≥ 2 suara, dan label baru boleh muncul lagi minimal 8 detik setelah yang terakhir (agar tidak berkedip saat suara sangat ketat).
 */
const OVERTAKE_MARGIN = 2;
const OVERTAKE_COOLDOWN_MS = 8000;
function useOvertake(a: number, b: number, off = false): number {
  const lead = a > b ? 0 : b > a ? 1 : -1;
  const sure = Math.abs(a - b) >= OVERTAKE_MARGIN;
  const prev = useRef(lead);
  const lastAt = useRef(0);
  const [ov, setOv] = useState<{ side: number; at: number } | null>(null);
  useEffect(() => {
    if (lead === -1 || !sure) return;
    const before = prev.current;
    prev.current = lead;
    if (off || before === -1 || before === lead) return;
    const now = Date.now();
    if (now - lastAt.current < OVERTAKE_COOLDOWN_MS) return;
    lastAt.current = now;
    setOv({ side: lead, at: now });
    sfx.overtake();
    const t = setTimeout(() => setOv(null), 2600);
    return () => clearTimeout(t);
  }, [lead, sure, off]);
  return ov ? ov.side : -1;
}

/** Jeda singkat sebelum isi tampil: teaser muncul ~`ms` setelah payload dikirim. Tidak muncul untuk overlay yang dimuat ulang di tengah tayangan. */
function Teaser({ at, ms = 2000, emoji, label, children }: { at: number; ms?: number; emoji: string; label: string; children: ReactNode }) {
  const [left, setLeft] = useState(() => Math.max(0, ms - (Date.now() - at)));
  useEffect(() => {
    const l = Math.max(0, ms - (Date.now() - at));
    setLeft(l);
    if (!l) return;
    const t = setTimeout(() => { setLeft(0); sfx.reveal(); }, l);
    return () => clearTimeout(t);
  }, [at, ms]);
  if (left <= 0) return <>{children}</>;
  return (
    <div className="ov-body ov-teaser">
      <div className="ov-emoji wiggle">{emoji}</div>
      <span className="ov-teaser-text">{label}<span className="ov-teaser-dots"><i /><i /><i /></span></span>
    </div>
  );
}

type OptItem = { key: string; label: string; wide?: boolean };
/** Dua pilihan dengan isi warna menurut persentase vote. */
function Opts({ votes, items }: { votes: { a: number; b: number } | undefined; items: [OptItem, OptItem] | OptItem[] }) {
  const a = votes?.a ?? 0; const b = votes?.b ?? 0; const total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 0;
  const pcts = [pa, total ? 100 - pa : 0];
  const counts = [a, b];
  const cols = ["var(--primary)", "var(--electric)"];
  const over = useOvertake(a, b);
  return (
    <div className="ov-opts">
      {items.slice(0, 2).map((it, i) => (
        <div key={i} className={`ov-opt${total && pcts[i]! > pcts[1 - i]! ? " win" : ""}${over === i ? " overtook" : ""}`} style={{ "--c": cols[i], "--pct": `${pcts[i]}%` } as CSSProperties}>
          {over === i && <span className="ov-overtake">🔥 Menyalip!</span>}
          <span className={`ov-key${it.wide ? " wide" : ""}`}>{it.key}</span>
          <span className="ov-opt-text" style={{ fontSize: `${fit(it.label) * 0.62}em` }}>{it.label}</span>
          <span className="ov-pct" style={{ fontSize: "1.5em" }}>{pcts[i]}%<small key={counts[i]} className="ov-bump">{counts[i]} suara</small></span>
        </div>
      ))}
    </div>
  );
}

function ThisOrThat({ a, b, end, votes, outro }: { a?: string | undefined; b?: string | undefined; end?: number | undefined; votes: { a: number; b: number } | undefined; outro?: boolean }) {
  const [left, setLeft] = useState(0);
  const [isTimeOver, setIsTimeOver] = useState(() => !!end && Date.now() >= end);
  useEffect(() => {
    if (!end) { setIsTimeOver(false); return; }
    const tick = () => { setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))); setIsTimeOver(Date.now() >= end); };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [end]);
  // Hasil keluar kalau countdown habis (dikirim manual) atau waktu tayang antrean habis (outro dari dashboard).
  const resolved = !!outro || isTimeOver;
  const a0 = votes?.a ?? 0; const b0 = votes?.b ?? 0; const total = a0 + b0;
  const pa = total ? Math.round((a0 / total) * 100) : 0;
  const pcts = [pa, total ? 100 - pa : 0];
  const champ = resolved && total ? (a0 > b0 ? 0 : b0 > a0 ? 1 : -1) : -1;
  const over = useOvertake(a0, b0, resolved);
  const tie = resolved && total > 0 && a0 === b0;
  const opt = (i: 0 | 1, key: string, text: string | undefined, c: string) => (
    <div className={`ov-opt${total && pcts[i]! > pcts[1 - i]! ? " win" : ""}${champ === i ? " champ" : ""}${champ === 1 - i ? " lose" : ""}${tie ? " tied" : ""}${over === i ? " overtook" : ""}`} style={{ "--c": c, "--pct": `${pcts[i]}%` } as CSSProperties}>
      {over === i && <span className="ov-overtake">🔥 Menyalip!</span>}
      <span className="ov-key">{champ === i ? <span className="ov-crown">👑</span> : key}</span>
      <span className="ov-opt-text" style={{ fontSize: `${fit(text) * 0.78}em` }}>{text}</span>
      <span className="ov-pct" style={{ fontSize: "1.5em" }}>{pcts[i]}%<small key={i === 0 ? a0 : b0} className="ov-bump">{i === 0 ? a0 : b0} suara</small></span>
    </div>
  );
  const winnerText = champ === 0 ? a : champ === 1 ? b : undefined;
  // Detak hitung mundur: pelan di 10 detik terakhir, tebal di 3-2-1.
  useEffect(() => {
    if (resolved || !end || left <= 0 || left > 10) return;
    sfx.tick(left <= 3);
  }, [left, resolved, end]);
  // Hasil keluar: gong, lalu fanfare / nada seri / nada sepi. Tidak berbunyi kalau overlay baru dimuat dalam keadaan sudah selesai.
  const wasResolved = useRef(resolved);
  useEffect(() => {
    if (resolved && !wasResolved.current) {
      sfx.timeUp();
      const t = setTimeout(() => { if (tie) sfx.tie(); else if (total) sfx.win(); else sfx.none(); }, 450);
      wasResolved.current = resolved;
      return () => clearTimeout(t);
    }
    wasResolved.current = resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
  return (
    <div className={`ov-body${resolved ? " resolved" : ""}`}>
      <div className="ov-opts">
        {opt(0, "A", a, "var(--primary)")}
        <div className={`ov-vs${!resolved && end && left > 0 && left <= 3 ? " urgent" : ""}${resolved ? " done" : ""}`}>{resolved ? (tie ? "=" : total ? "🏆" : "?") : end && left > 0 ? left : "VS"}</div>
        {opt(1, "B", b, "var(--electric)")}
      </div>
      {!resolved && end && left > 0 && left <= 3 && <div key={left} className="ov-count3" aria-hidden>{left}</div>}
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
  // Meteran terisi (0,2 dtk) → cap menghantam (≈1,2 dtk, sesuai animasi ov-stamp).
  useEffect(() => {
    const t1 = setTimeout(() => sfx.meter(), 200);
    const t2 = setTimeout(() => sfx.stamp(kind), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  useEffect(() => { const t = setTimeout(() => sfx.seal(), 560); return () => clearTimeout(t); }, []); // segel mendarat ≈ 0,6 dtk
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
  useEffect(() => { sfx.vortex(); }, []);
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
  // Klik roda tiap melewati satu irisan (makin cepat makin tinggi nadanya), lalu fanfare saat berhenti.
  const lastSlice = useRef(-1);
  const lastAngle = useRef(angle);
  useEffect(() => {
    if (phase !== "spinning" || n < 1) { lastSlice.current = -1; lastAngle.current = angle; return; }
    const sl = Math.floor(angle / (360 / n));
    if (lastSlice.current !== -1 && sl !== lastSlice.current) sfx.wheel(Math.min(1, Math.abs(angle - lastAngle.current) / 25));
    lastSlice.current = sl; lastAngle.current = angle;
  }, [angle, phase, n]);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current === "spinning" && phase === "result") sfx.wheelWin();
    prevPhase.current = phase;
  }, [phase]);
  useEffect(() => { if (p.addedAt !== undefined && Date.now() - p.addedAt < 1500) sfx.add(); }, [p.addedAt]);
  return (
    <div className={`ov-body ov-spin${dense ? " dense" : ""}${phase === "result" ? " res" : ""}`}>
      <div className="ov-spin-top">
        {p.category && <span className="ov-chip soft">{p.category}</span>}
        {flash && <span className="ov-chip add">➕ Ditambahkan ke roda</span>}
        {p.queued ? <span key={p.queuedAt} className="ov-chip add queued">⏳ {p.queued} pertanyaan baru menunggu putaran berikutnya</span> : null}
      </div>
      <div className="ov-spin-main">
        <div className={`ov-wheelwrap${flash ? " pulse" : ""}`}>
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
  const flash = useFlash(p.addedAt, 3000);
  const freshFrom = flash && p.added ? n - p.added : n; // indeks kartu yang baru masuk
  const showMeter = phase === "standby" || phase === "dealt";
  const prevPhase = useRef(phase);
  useEffect(() => {
    const before = prevPhase.current; prevPhase.current = phase;
    if (before === phase) return;
    if (phase === "shuffling") sfx.shuffle();
    else if (phase === "dealt") for (let i = 0; i < n; i++) sfx.deal(i);
    else if (phase === "revealed") sfx.flip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => {
    if (p.addedAt === undefined || Date.now() - p.addedAt > 1500) return;
    sfx.add();
    if (n >= 6) setTimeout(() => sfx.win(), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.addedAt]);
  return (
    <div className="ov-body">
      {showMeter && (flash || n < 6) && (
        <div className="ov-deckinfo">
          {flash && <span key={p.addedAt} className="ov-chip add">🃏 Kartu baru masuk{n >= 6 ? " · deck penuh!" : ""}</span>}
          <span className="ov-dots6" aria-label={`${n} dari 6 kartu`}>{Array.from({ length: 6 }).map((_, i) => <i key={i} className={i < n ? "on" : ""} />)}<b>{n}/6</b></span>
        </div>
      )}
      {flash && n >= 6 && <Burst emoji={["🃏", "✨", "🎴", "⭐"]} n={14} />}
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
            <div key={i} className={`flip-card ov-fc${on ? " on" : ""}${done ? " done" : ""}${i >= freshFrom ? " ov-fc-new" : ""}`}
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
  useEffect(() => { if (rolling) sfx.roll(tick); }, [tick, rolling]);
  const wasRolling = useRef(rolling);
  useEffect(() => { if (wasRolling.current && !rolling) sfx.lock(); wasRolling.current = rolling; }, [rolling]);
  return (
    <div className="ov-words">
      {words.map((w, i) => rolling
        ? <div key={`roll-${i}`} className="ov-word roll" style={{ background: COLORS[i % 3] }}>{pool[(tick * (i + 3) + i * 7) % pool.length]}</div>
        : <div key={`${w}-${i}`} className="ov-word" style={{ animationDelay: `${i * 0.18}s`, background: COLORS[i % 3] }}>{w}</div>)}
    </div>
  );
}

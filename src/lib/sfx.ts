/**
 * Suara overlay: efek suara (`sfx`) + musik latar generatif per gimmick (`music`).
 * Semuanya disintesis dengan WebAudio (tanpa berkas audio), jadi ringan untuk OBS / TikTok LIVE Studio.
 * Kalau suara dimatikan (pengaturan / pratinjau dashboard) semua panggilan diam saja.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;   // bus efek suara
let musicBus: GainNode | null = null; // bus musik latar (bisa di-duck saat efek besar berbunyi)
let noiseBuf: AudioBuffer | null = null;
let enabled = false;
const lastAt: Record<string, number> = {};
const MUSIC_BASE = 0.3;

/** Nyalakan/matikan semua suara. Dipanggil OverlayView menurut `state.sound` dan mode pratinjau. */
export function setSfxEnabled(on: boolean) {
  if (!on && enabled) music.stop();
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); // supaya banyak suara sekaligus tidak pecah
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_BASE; musicBus.connect(comp);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/* ---- Status "audio diblokir browser" (autoplay policy) ---- */
let blocked = false;
const listeners = new Set<() => void>();
function setBlocked(b: boolean) { if (b !== blocked) { blocked = b; listeners.forEach((l) => l()); } }
export const sfxBlocked = () => blocked;
export const subscribeSfxBlocked = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Buat AudioContext lebih awal dan cek apakah browser mengizinkannya jalan. Kalau tidak, `sfxBlocked()` jadi true (dipakai untuk menampilkan tombol aktivasi). */
export function probeSfx() {
  const c = ac(); if (!c) return;
  c.onstatechange = () => setBlocked(c.state !== "running");
  setBlocked(c.state !== "running");
}

/** Dipanggil dari klik tombol aktivasi: membuka audio lalu memutar satu bunyi sebagai konfirmasi. */
export async function resumeSfx() {
  const c = ac(); if (!c) return;
  try { await c.resume(); } catch { /* abaikan */ }
  setBlocked(c.state !== "running");
  if (c.state === "running") { tone(pn(4), 0.15, { type: "triangle", vol: 0.15 }); tone(pn(7), 0.25, { t: 0.1, type: "triangle", vol: 0.15 }); }
}

/** Interaksi pertama di halaman (klik/tombol/sentuh) otomatis membuka audio. */
export function unlockSfx() {
  if (typeof window === "undefined") return;
  const go = () => { void resumeSfx(); };
  window.addEventListener("pointerdown", go, { once: true });
  window.addEventListener("keydown", go, { once: true });
  window.addEventListener("touchstart", go, { once: true });
}

/** Batasi pemanggilan beruntun supaya tidak menumpuk (mis. banyak vote dalam sekejap). */
function gate(key: string, ms: number): boolean {
  const now = Date.now();
  if (now - (lastAt[key] ?? 0) < ms) return false;
  lastAt[key] = now;
  return true;
}

/* ================= Mesin suara dasar (dipakai efek DAN musik) ================= */

type Wave = OscillatorType;
type Inst = { type?: Wave; vol?: number; f2?: number; a?: number; det?: number; lp?: number; lp2?: number; q?: number; sustain?: boolean };

/** Satu nada pada waktu absolut `t`. Envelope: naik cepat lalu meluruh (atau ditahan kalau `sustain`). Opsional low-pass yang menyapu `lp`→`lp2`. */
function inst(out: AudioNode, t: number, f: number, dur: number, o: Inst = {}) {
  const c = ctx; if (!c) return;
  const osc = c.createOscillator(); const g = c.createGain();
  osc.type = o.type ?? "triangle";
  osc.frequency.setValueAtTime(f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
  if (o.det) osc.detune.value = o.det;
  const v = o.vol ?? 0.1; const a = o.a ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  if (o.sustain) { const rel = Math.min(0.25, dur * 0.3); g.gain.setValueAtTime(v, Math.max(t + a, t + dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.lp) {
    const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = o.q ?? 1;
    fl.frequency.setValueAtTime(o.lp, t);
    if (o.lp2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.lp2), t + dur);
    osc.connect(fl).connect(g);
  } else osc.connect(g);
  g.connect(out);
  osc.start(t); osc.stop(t + dur + 0.05);
}

type Nz = { vol?: number; from?: number; to?: number; q?: number; type?: BiquadFilterType };
/** Noise tersaring pada waktu absolut `t`: dasar whoosh, klik, hi-hat, tepuk tangan. */
function nz(out: AudioNode, t: number, dur: number, o: Nz = {}) {
  const c = ctx; if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.type ?? "bandpass"; f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.from ?? 800, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
  const g = c.createGain(); const v = o.vol ?? 0.15;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

/** Pembungkus efek suara: waktu relatif dari sekarang, keluar ke bus efek. */
function tone(f: number, dur: number, o: { t?: number; type?: Wave; vol?: number; f2?: number; attack?: number; detune?: number } = {}) {
  const c = ac(); if (!c || !master) return;
  inst(master, c.currentTime + (o.t ?? 0), f, dur, { type: o.type ?? "sine", vol: o.vol ?? 0.2, f2: o.f2, a: o.attack ?? 0.008, det: o.detune });
}
function noise(dur: number, o: Nz & { t?: number } = {}) {
  const c = ac(); if (!c || !master) return;
  nz(master, c.currentTime + (o.t ?? 0), dur, o);
}

/** Turunkan sebentar volume musik supaya efek besar terdengar jelas (lalu naik pelan lagi). */
function duck(depth = 0.45, secs = 1) {
  const c = ctx; if (!c || !musicBus) return;
  const now = c.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(MUSIC_BASE * musicLevel * depth, now, 0.03);
  musicBus.gain.setTargetAtTime(MUSIC_BASE * musicLevel, now + secs, 0.45);
}

/** Pentatonik mayor C: apa pun urutannya selalu enak didengar. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const pn = (i: number) => PENTA[Math.max(0, Math.min(PENTA.length - 1, i))]!;

/* ================= Efek suara ================= */

export const sfx = {
  /** Item baru tayang: whoosh masuk + arpeggio ceria. Warna nada beda tiap gimmick. */
  enter(gimmick?: string) {
    if (!gate("enter", 250)) return;
    duck(0.5, 0.8);
    noise(0.35, { from: 500, to: 3200, vol: 0.1, q: 0.8 });
    const base = gimmick === "confession" || gimmick === "audience" ? [0, 2, 4] : gimmick === "chaos" ? [4, 1, 3, 0] : gimmick === "hottake" ? [0, 3, 5] : gimmick === "spin" ? [0, 1, 2, 3, 4] : gimmick === "card" ? [2, 4, 6] : [0, 2, 3, 5];
    base.forEach((n, i) => {
      tone(pn(n), 0.28, { t: 0.08 + i * 0.07, type: "triangle", vol: 0.16 });
      tone(pn(n) * 2, 0.2, { t: 0.08 + i * 0.07, type: "sine", vol: 0.05 });
    });
  },
  /** Ganti jenis gimmick: sapuan naik + kilau. */
  swoosh() {
    if (!gate("swoosh", 600)) return;
    duck(0.35, 1.2);
    noise(0.6, { from: 300, to: 5000, vol: 0.13, q: 0.7 });
    tone(330, 0.5, { type: "sawtooth", f2: 990, vol: 0.05 });
    [8, 9, 7].forEach((n, i) => tone(pn(n), 0.25, { t: 0.4 + i * 0.07, type: "sine", vol: 0.09 }));
  },
  /** Vote masuk: pop yang naik nadanya selama vote beruntun, makin ramai makin seru. */
  vote(streak = 0, count = 1) {
    if (!gate("vote", 70)) return;
    const i = Math.min(PENTA.length - 1, streak % 10);
    tone(pn(i), 0.16, { type: "triangle", vol: 0.17, f2: pn(i) * 1.02 });
    tone(pn(i) / 2, 0.1, { type: "sine", vol: 0.1 });
    if (count > 1) [0, 1, 2].forEach((k) => tone(pn(Math.min(9, i + 2 + k)), 0.12, { t: 0.05 + k * 0.045, type: "triangle", vol: 0.1 }));
    if (streak > 0 && streak % 10 === 0) [5, 7, 9].forEach((n, k) => tone(pn(n), 0.3, { t: 0.08 + k * 0.06, type: "square", vol: 0.05 })); // kelipatan 10: bonus
  },
  /** Tonggak jumlah vote (tiap 25): naik tangga nada + ding. */
  combo() {
    if (!gate("combo", 1500)) return;
    duck(0.55, 0.9);
    [3, 4, 5, 6, 8].forEach((n, i) => tone(pn(n), 0.18, { t: i * 0.06, type: "square", vol: 0.06 }));
    tone(pn(9), 0.7, { t: 0.32, type: "sine", vol: 0.16 });
    noise(0.4, { t: 0.3, from: 7000, to: 10000, vol: 0.05, type: "highpass" });
  },
  /** Ada yang menyalip: sirene naik + fanfare pendek. */
  overtake() {
    if (!gate("overtake", 800)) return;
    duck(0.4, 1.2);
    tone(260, 0.35, { type: "sawtooth", f2: 880, vol: 0.09 });
    noise(0.3, { from: 400, to: 4000, vol: 0.08 });
    [2, 4, 6, 8].forEach((n, i) => tone(pn(n), 0.22, { t: 0.18 + i * 0.07, type: "square", vol: 0.07 }));
    tone(pn(8), 0.5, { t: 0.5, type: "triangle", vol: 0.14 });
  },
  /** Detik hitung mundur. `urgent` = 3-2-1 terakhir (lebih tinggi & tebal). */
  tick(urgent = false) {
    if (!gate("tick", 120)) return;
    if (urgent) { tone(880, 0.12, { type: "square", vol: 0.1 }); tone(440, 0.18, { type: "sine", vol: 0.14 }); } else tone(1200, 0.04, { type: "square", vol: 0.04 });
  },
  /** Gulungan drum yang makin keras (ketegangan sebelum hasil). */
  drumroll(secs = 3) {
    if (!gate("drumroll", 1500)) return;
    const n = Math.round(secs / 0.05);
    for (let i = 0; i < n; i++) noise(0.05, { t: i * 0.05, from: 2200, vol: 0.02 + (i / n) * 0.12, q: 0.8 });
    tone(180, secs, { type: "triangle", vol: 0.04, f2: 260, attack: secs * 0.8 });
  },
  /** Waktu habis: gong + pembuka hasil. */
  timeUp() {
    duck(0.3, 1.6);
    tone(196, 0.9, { type: "sine", vol: 0.25 }); tone(392, 0.7, { type: "triangle", vol: 0.1 });
    noise(0.4, { from: 2400, to: 400, vol: 0.08, q: 0.6 });
  },
  /** Simbal crash: ledakan pembuka perayaan. */
  crash() { noise(1.6, { from: 8000, type: "highpass", vol: 0.12, q: 0.4 }); noise(0.5, { from: 5000, to: 3000, vol: 0.06, q: 0.5 }); },
  /** Tepuk tangan & sorak penonton (ratusan klik noise acak yang membesar lalu mereda). */
  cheer(secs = 1.8) {
    const n = Math.round(secs * 30);
    for (let i = 0; i < n; i++) {
      const env = Math.sin(Math.PI * (i / n)) ** 0.7;
      noise(0.04 + Math.random() * 0.05, { t: (i / n) * secs + Math.random() * 0.03, from: 1600 + Math.random() * 3600, vol: 0.05 * env, q: 0.4 });
    }
  },
  /** Pemenang: fanfare + simbal + tepuk tangan. */
  win() {
    if (!gate("win", 1000)) return;
    duck(0.4, 2.4);
    [0, 2, 3, 5].forEach((n, i) => tone(pn(n), 0.26, { t: i * 0.09, type: "square", vol: 0.07 }));
    [0, 2, 4, 5].forEach((n) => tone(pn(n), 0.9, { t: 0.4, type: "triangle", vol: 0.12 }));
    noise(0.5, { t: 0.4, from: 6000, to: 9000, vol: 0.05, type: "highpass" }); // konfeti
    setTimeout(() => { sfx.crash(); sfx.cheer(1.8); }, 380);
  },
  /** Seri: dua nada saling ragu. */
  tie() { [4, 3, 4, 3].forEach((n, i) => tone(pn(n), 0.18, { t: i * 0.14, type: "triangle", vol: 0.13 })); },
  /** Sepi / tidak ada suara: nada turun ala "wah-wah". */
  none() { [4, 3, 2, 0].forEach((n, i) => tone(pn(n) / 2, 0.3, { t: i * 0.2, type: "sawtooth", vol: 0.07, f2: pn(n) / 2.2 })); },
  /** Buzzer "salah / ditolak". */
  buzzer() { tone(110, 0.5, { type: "sawtooth", vol: 0.1 }); tone(117, 0.5, { type: "square", vol: 0.05 }); },
  /** Cap hasil menghantam layar (Hot Take). */
  stamp(kind: "agree" | "disagree" | "tie" | "none" = "agree") {
    duck(0.3, 1.8);
    tone(140, 0.35, { type: "sine", f2: 45, vol: 0.4 });
    noise(0.18, { from: 1800, to: 300, vol: 0.2, q: 0.5 });
    if (kind === "agree") { [3, 5, 7].forEach((n, i) => tone(pn(n), 0.4, { t: 0.1 + i * 0.07, type: "triangle", vol: 0.12 })); setTimeout(() => sfx.cheer(1.2), 250); }
    else if (kind === "disagree") { tone(110, 0.5, { t: 0.08, type: "sawtooth", f2: 70, vol: 0.12 }); tone(98, 0.5, { t: 0.08, type: "square", vol: 0.05 }); setTimeout(() => sfx.buzzer(), 150); }
    else if (kind === "tie") sfx.tie();
    else sfx.none();
  },
  /** Meteran Hot Take terisi: sapuan naik halus. */
  meter() { tone(300, 1, { type: "sine", f2: 900, vol: 0.06, attack: 0.2 }); },
  /** Segel rahasia (Confession): klik kunci + gema rendah. */
  seal() {
    duck(0.3, 2);
    noise(0.05, { from: 3500, vol: 0.2, q: 4 }); tone(1800, 0.06, { type: "square", vol: 0.06 });
    tone(110, 0.9, { t: 0.04, type: "sine", f2: 70, vol: 0.3 });
    [0, 2, 4].forEach((n, i) => tone(pn(n) / 2, 1, { t: 0.2 + i * 0.05, type: "sine", vol: 0.08 }));
  },
  /** Teaser confession selesai: kilau misterius. */
  reveal() { [2, 5, 3, 7].forEach((n, i) => tone(pn(n), 0.35, { t: i * 0.08, type: "sine", vol: 0.1 })); noise(0.5, { from: 4000, to: 9000, vol: 0.04, type: "highpass" }); },
  /** Pusaran Random Chaos: sapuan turun + glitch. */
  vortex() {
    duck(0.3, 2.2);
    tone(900, 1.8, { type: "sawtooth", f2: 60, vol: 0.1, attack: 0.05 });
    noise(1.6, { from: 3000, to: 200, vol: 0.12, q: 2 });
    for (let i = 0; i < 6; i++) tone(200 + Math.random() * 1400, 0.05, { t: 0.2 + i * 0.22, type: "square", vol: 0.05 });
  },
  /** Kata Chaos berguling. */
  roll(i = 0) { tone(300 + (i % 6) * 70, 0.05, { type: "square", vol: 0.035 }); },
  /** Kata Chaos berhenti: dentuman + akor. */
  lock() { duck(0.5, 1); tone(120, 0.3, { type: "sine", f2: 60, vol: 0.3 }); [0, 2, 4].forEach((n, i) => tone(pn(n), 0.5, { t: 0.04 + i * 0.06, type: "triangle", vol: 0.12 })); },
  /** Klik roda tiap melewati satu irisan. `speed` 0..1 menentukan tinggi nada. */
  wheel(speed = 0.5) {
    if (!gate("wheel", 38)) return;
    tone(520 + speed * 520, 0.04, { type: "triangle", vol: 0.12 });
    noise(0.02, { from: 4000, vol: 0.06, q: 3 });
  },
  /** Roda berhenti di pemenang. */
  wheelWin() { sfx.win(); tone(70, 0.4, { type: "sine", vol: 0.3, f2: 40 }); },
  /** Kartu dikocok. */
  shuffle() { duck(0.6, 0.9); for (let i = 0; i < 7; i++) noise(0.07, { t: i * 0.07, from: 2500 + (i % 2) * 1500, vol: 0.08, q: 1.5 }); },
  /** Kartu dibagi / ditempatkan. */
  deal(i = 0) { noise(0.09, { t: i * 0.08, from: 1500, to: 4500, vol: 0.1, q: 1 }); tone(300, 0.06, { t: i * 0.08, type: "triangle", vol: 0.05 }); },
  /** Kartu dibalik. */
  flip() {
    duck(0.5, 1.2);
    noise(0.22, { from: 1200, to: 5000, vol: 0.12, q: 0.8 });
    [4, 6, 8].forEach((n, i) => tone(pn(n), 0.3, { t: 0.2 + i * 0.07, type: "triangle", vol: 0.12 }));
  },
  /** Ada item baru masuk roda / deck. */
  add() { tone(pn(4), 0.12, { type: "triangle", vol: 0.14 }); tone(pn(7), 0.2, { t: 0.09, type: "triangle", vol: 0.14 }); },
  /** Banner gift: koin + kilau. */
  gift() {
    duck(0.5, 1.4);
    tone(988, 0.08, { type: "square", vol: 0.08 }); tone(1319, 0.5, { t: 0.08, type: "square", vol: 0.08 });
    [6, 8, 9, 7, 9].forEach((n, i) => tone(pn(n), 0.2, { t: 0.2 + i * 0.06, type: "sine", vol: 0.08 }));
  },
};

/* ================= Musik latar generatif =================
 * Tiap gimmick punya "lagu" sendiri (tempo, tangga nada, instrumen, pola drum) yang dimainkan terus-menerus oleh penjadwal 16-langkah.
 * Musiknya ikut bereaksi: tiap vote / hitung mundur / roda berputar menaikkan "energi" (0..1) sehingga lapisan hi-hat, arpeggio, dan riser ikut masuk.
 */

type Chord = { r: number; q: number[] };
type Step = { t: number; s: number; bar: number; e: number; chord: Chord; out: AudioNode; d: number; r: () => number; m: Record<string, number> };
type Track = { bpm: number; swing?: number; base: number; prog: Chord[]; step: (c: Step) => void };

const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const pick = <T,>(a: readonly T[], i: number): T => a[((i % a.length) + a.length) % a.length]!;
const MAJ = [0, 4, 7], MIN = [0, 3, 7], DIM = [0, 3, 6, 9], MAJ7 = [0, 4, 7, 11], MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10];
const MAJP = [0, 2, 4, 7, 9], MINP = [0, 3, 5, 7, 10];
const ch = (r: number, q: number[]): Chord => ({ r, q });

// instrumen
const kick = (o: AudioNode, t: number, v = 0.45) => inst(o, t, 150, 0.22, { type: "sine", f2: 42, vol: v });
const snare = (o: AudioNode, t: number, v = 0.22) => { nz(o, t, 0.16, { from: 1800, vol: v, q: 0.7 }); inst(o, t, 210, 0.1, { type: "triangle", f2: 140, vol: v * 0.6 }); };
const clap = (o: AudioNode, t: number, v = 0.15) => { for (let k = 0; k < 3; k++) nz(o, t + k * 0.012, 0.05, { from: 1500, vol: v * 0.8, q: 1 }); nz(o, t + 0.03, 0.14, { from: 1500, vol: v, q: 1 }); };
const hat = (o: AudioNode, t: number, v = 0.05, open = false) => nz(o, t, open ? 0.16 : 0.04, { from: 7000, type: "highpass", vol: v, q: 0.5 });
const bell = (o: AudioNode, t: number, f: number, v = 0.08) => { inst(o, t, f, 1.4, { type: "sine", vol: v }); inst(o, t, f * 2.76, 0.6, { type: "sine", vol: v * 0.35 }); };
const marimba = (o: AudioNode, t: number, f: number, v = 0.08) => { inst(o, t, f, 0.28, { type: "sine", vol: v }); inst(o, t, f * 4, 0.06, { type: "sine", vol: v * 0.4 }); };
const harp = (o: AudioNode, t: number, f: number, v = 0.07) => { inst(o, t, f, 0.7, { type: "triangle", vol: v, lp: 4000, lp2: 900 }); inst(o, t, f * 2, 0.35, { type: "sine", vol: v * 0.3 }); };
const pad = (o: AudioNode, t: number, f: number, dur: number, v = 0.05) => { inst(o, t, f, dur, { type: "triangle", vol: v, a: dur * 0.25, sustain: true, det: -6 }); inst(o, t, f, dur, { type: "sawtooth", vol: v * 0.35, a: dur * 0.3, sustain: true, det: 7, lp: 900 }); };

const TRACKS: Record<string, Track> = {
  /** This or That: gameshow ceria. Energi tinggi = hi-hat 16, arpeggio rapat, riser. */
  thisorthat: {
    bpm: 126, base: 0.4, prog: [ch(48, MAJ), ch(45, MIN), ch(53, MAJ), ch(55, MAJ)],
    step({ t, s, e, chord, out, d }) {
      const { r, q } = chord;
      if (s % 4 === 0 && (e > 0.2 || s % 8 === 0)) kick(out, t, 0.42);
      if (e > 0.45 && (s === 4 || s === 12)) clap(out, t, 0.15);
      if (s % 4 === 2) hat(out, t, 0.05, s === 14); else if (e > 0.6 && s % 2 === 1) hat(out, t, 0.025);
      if ([0, 3, 6, 8, 11, 14].includes(s)) inst(out, t, mf(r - 12 + (s === 6 || s === 14 ? 7 : 0)), d * 1.6, { type: "sawtooth", vol: 0.13, lp: 700, lp2: 200 });
      if (e > 0.25 && (s % 2 === 0 || e > 0.75)) inst(out, t, mf(r + 12 + q[(s >> 1) % q.length]! + (s % 8 >= 4 ? 12 : 0)), d * 1.4, { type: "square", vol: 0.035, lp: 3200, lp2: 900 });
      if (s === 0) q.forEach((n) => pad(out, t, mf(r + n), d * 15, 0.04));
      if (e > 0.9 && s === 12) nz(out, t, d * 4, { from: 600, to: 7000, vol: 0.07, q: 0.8 });
    },
  },
  /** Hot Take: beat panas bernuansa tegang. */
  hottake: {
    bpm: 104, base: 0.45, prog: [ch(45, MIN), ch(45, MIN), ch(41, MAJ), ch(43, MAJ)],
    step({ t, s, e, chord, out, d }) {
      const { r, q } = chord;
      if (s === 0 || s === 6 || s === 10 || (e > 0.6 && s === 3)) kick(out, t, 0.5);
      if (s === 4 || s === 12) snare(out, t, 0.22); else if (e > 0.5 && s === 15) snare(out, t, 0.07);
      if (s % 2 === 0) hat(out, t, s % 4 === 2 ? 0.055 : 0.03, s === 14); else if (e > 0.7) hat(out, t, 0.02);
      if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) inst(out, t, mf(r - 12 + (s === 3 || s === 11 ? 12 : 0)), d * 1.5, { type: "sawtooth", vol: 0.15, lp: 520, lp2: 140, q: 3 });
      if (e > 0.35 && (s === 7 || s === 15)) q.forEach((n) => inst(out, t, mf(r + 12 + n), d * 1.4, { type: "square", vol: 0.035, lp: 2200, lp2: 600 }));
      if (e > 0.8 && s === 0) inst(out, t, 300, d * 16, { type: "sawtooth", f2: 900, vol: 0.02, lp: 1500 });
    },
  },
  /** Confession: misterius, detak jantung + kotak musik. */
  confession: {
    bpm: 70, base: 0.3, prog: [ch(50, MIN), ch(46, MAJ), ch(43, MIN), ch(45, MAJ)],
    step({ t, s, e, chord, out, d, r }) {
      const { r: root, q } = chord;
      if (s === 0) { q.forEach((n) => pad(out, t, mf(root + n), d * 16, 0.05)); inst(out, t, mf(root - 12), d * 15, { type: "sine", vol: 0.13, a: 0.4, sustain: true }); kick(out, t, 0.2); }
      if (s === 3) kick(out, t, 0.13);
      if (s % 2 === 0 && r() < 0.16 + e * 0.3) bell(out, t, mf(root + 24 + pick(MINP, Math.floor(r() * 5)) + (r() < 0.3 ? 12 : 0)), 0.08);
      if (s === 8 && r() < 0.18) nz(out, t, 1.4, { from: 3000, to: 1500, vol: 0.02, q: 3 });
    },
  },
  /** Random Chaos: glitchy, acak, nada disonan. */
  chaos: {
    bpm: 138, base: 0.5, prog: [ch(48, DIM), ch(51, DIM), ch(46, DIM), ch(49, DIM)],
    step({ t, s, e, chord, out, d, r }) {
      const { r: root, q } = chord;
      if (s % 8 === 0 || (s % 2 === 0 && e > 0.4 && r() < 0.2)) kick(out, t, 0.45);
      if (s === 4 || s === 12) snare(out, t, 0.18); else if (r() < 0.08) clap(out, t, 0.1);
      if (r() < 0.55) hat(out, t, 0.04, r() < 0.1);
      if (s % 2 === 0) inst(out, t, mf(root - 12 + (r() < 0.2 ? 7 : 0)), d * 1.5, { type: "sawtooth", vol: 0.12, lp: 900, lp2: 120, q: 4 });
      if (r() < 0.2 + e * 0.4) { const f = mf(root + 24 + pick(q, Math.floor(r() * 4)) + (r() < 0.4 ? 12 : 0)); inst(out, t, f, d * (0.5 + r()), { type: "square", vol: 0.03, f2: f * (r() < 0.5 ? 0.5 : 2), lp: 3500 }); }
      if (r() < 0.07) nz(out, t, d * 0.5, { from: 4000 + r() * 4000, type: "highpass", vol: 0.06 });
      if (s === 15 && r() < 0.12) inst(out, t, mf(root + 24), d * 4, { type: "sawtooth", f2: mf(root), vol: 0.05, lp: 2500 });
    },
  },
  /** Spin: karnaval riang. Saat roda berputar (energi tinggi) ada ratchet hi-hat, marimba oktaf, dan snare roll. */
  spin: {
    bpm: 132, base: 0.4, prog: [ch(55, MAJ), ch(48, MAJ), ch(55, MAJ), ch(50, MAJ)],
    step({ t, s, bar, e, chord, out, d, r, m }) {
      const { r: root, q } = chord;
      if (s === 0 || s === 8 || (e > 0.6 && (s === 4 || s === 12))) kick(out, t, 0.4);
      if (s === 4 || s === 12) clap(out, t, 0.13);
      if (s === 0) inst(out, t, mf(root - 12), d * 3, { type: "triangle", vol: 0.17, lp: 900 });
      if (s === 8) inst(out, t, mf(root - 12 + 7), d * 3, { type: "triangle", vol: 0.15, lp: 900 });
      if (e > 0.3 && s % 4 === 2) q.forEach((n) => inst(out, t, mf(root + 12 + n), d * 0.8, { type: "square", vol: 0.022, lp: 2600 }));
      if (s % 2 === 0 && r() < 0.5 + e * 0.5) {
        m.mi = Math.max(0, Math.min(9, (m.mi ?? 4) + pick([-2, -1, 0, 1, 2], Math.floor(r() * 5))));
        const f = mf(root + 24 + pick(MAJP, m.mi) + 12 * Math.floor(m.mi / 5));
        marimba(out, t, f, 0.075); if (e > 0.7) marimba(out, t, f * 2, 0.035);
      }
      if (e > 0.55 && s % 2 === 1) hat(out, t, 0.03); if (e > 0.9) hat(out, t, 0.02);
      if (e > 0.8 && bar % 4 === 3 && s >= 12) snare(out, t, 0.08 + (s - 12) * 0.04);
    },
  },
  /** Pick a Card: harpa magis + pad berkilau. */
  card: {
    bpm: 88, base: 0.35, prog: [ch(52, MIN), ch(48, MAJ), ch(55, MAJ), ch(50, MAJ)],
    step({ t, s, e, chord, out, d, r }) {
      const { r: root, q } = chord;
      if (s === 0) { q.forEach((n) => pad(out, t, mf(root + n), d * 16, 0.045)); kick(out, t, 0.2); }
      if (s === 8 && e > 0.4) kick(out, t, 0.14);
      if (s % 2 === 0 || e > 0.6) { const seq = [q[0]!, q[1]!, q[2]!, q[1]! + 12, q[2]! + 12, q[1]! + 12, q[2]!, q[1]!]; harp(out, t, mf(root + 12 + seq[(s >> 1) % 8]!), 0.07); }
      if (s === 0 && r() < 0.6) [0, 1, 2].forEach((k) => bell(out, t + k * 0.11, mf(root + 36 + pick(MAJP, Math.floor(r() * 5))), 0.04));
      if (e > 0.5 && s % 4 === 2) hat(out, t, 0.03);
      if (e > 0.6 && s === 8) bell(out, t, mf(root + 36), 0.07);
    },
  },
  /** Audience / default: lo-fi santai, e-piano hangat. */
  audience: {
    bpm: 84, swing: 0.22, base: 0.3, prog: [ch(53, MAJ7), ch(52, MIN7), ch(50, MIN7), ch(55, DOM7)],
    step({ t, s, e, chord, out, d, r }) {
      const { r: root, q } = chord;
      if (s === 0 || s === 9 || (e > 0.5 && s === 10)) kick(out, t, 0.4);
      if (s === 4 || s === 12) { nz(out, t, 0.14, { from: 1500, vol: 0.12, q: 0.6 }); inst(out, t, 200, 0.08, { type: "triangle", vol: 0.06, f2: 140 }); }
      if (s % 2 === 0) hat(out, t, s % 4 === 0 ? 0.035 : 0.022);
      if (s === 0 || (e > 0.2 && s === 6)) q.forEach((n) => { inst(out, t, mf(root + 12 + n), d * (s === 0 ? 6 : 3), { type: "triangle", vol: 0.04, lp: 2200 }); inst(out, t, mf(root + 24 + n), d * 2, { type: "sine", vol: 0.012 }); });
      if (s === 0) inst(out, t, mf(root - 12), d * 5, { type: "sine", vol: 0.17 });
      if (s === 6 || s === 10) inst(out, t, mf(root - (s === 6 ? 12 : 5)), d * 3, { type: "sine", vol: 0.13 });
      if (s % 4 === 0 && r() < 0.25 + e * 0.3) inst(out, t, mf(root + 24 + pick(MAJP, Math.floor(r() * 5))), d * 3, { type: "triangle", vol: 0.04, lp: 2500 });
      if (r() < 0.06) nz(out, t, 0.012, { from: 6000, type: "highpass", vol: 0.02 }); // kerekan piringan hitam
    },
  },
};

type Session = { kind: string; out: GainNode; timer: number; nextT: number; n: number; track: Track; m: Record<string, number> };
let sess: Session | null = null;
let manualE = 0.4;
let hypeE = 0, hypeAt = 0;
let musicLevel = 1;

const hypeNow = () => Math.max(0, hypeE - ((Date.now() - hypeAt) / 1000) * 0.3);
const energyNow = () => Math.max(manualE, hypeNow());

function pump(s: Session) {
  const c = ctx; if (!c || sess !== s) return;
  if (s.nextT < c.currentTime - 0.3) s.nextT = c.currentTime + 0.05; // tab sempat tertahan: sinkron ulang
  while (s.nextT < c.currentTime + 0.7) {
    const d = 60 / s.track.bpm / 4;
    const bar = Math.floor(s.n / 16);
    const sw = s.n % 2 === 1 ? (s.track.swing ?? 0) * d : 0;
    s.track.step({ t: s.nextT + sw, s: s.n % 16, bar, e: energyNow(), chord: s.track.prog[bar % s.track.prog.length]!, out: s.out, d, r: Math.random, m: s.m });
    s.nextT += d; s.n++;
  }
}

function endSession(s: Session | null, fade: number) {
  if (!s) return;
  clearInterval(s.timer);
  const c = ctx;
  if (c) { s.out.gain.cancelScheduledValues(c.currentTime); s.out.gain.setTargetAtTime(0.0001, c.currentTime, fade / 4); }
  setTimeout(() => { try { s.out.disconnect(); } catch { /* sudah lepas */ } }, (fade + 1) * 1000);
}

export const music = {
  /** Mainkan lagu untuk gimmick `kind` (thisorthat | hottake | confession | chaos | spin | card | audience). Ganti lagu = crossfade. */
  play(kind: string) {
    const c = ac(); if (!c || !musicBus) return;
    if (sess?.kind === kind) return;
    const track = TRACKS[kind] ?? TRACKS.audience!;
    endSession(sess, 1.2);
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, c.currentTime); out.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.4); out.connect(musicBus);
    const s: Session = { kind, out, timer: 0, nextT: c.currentTime + 0.1, n: 0, track, m: {} };
    manualE = track.base;
    sess = s;
    s.timer = window.setInterval(() => pump(s), 60);
    pump(s);
  },
  /** Hentikan musik (fade-out pelan). */
  stop() { const s = sess; sess = null; endSession(s, 1); },
  /** Energi dasar 0..1: makin tinggi makin banyak lapisan (hi-hat, arpeggio, riser) masuk. */
  energy(x: number) { manualE = Math.max(0, Math.min(1, x)); },
  /** Lonjakan energi sesaat (mis. ada vote); meluruh sendiri dalam ±3 detik. */
  hype(amount = 0.3) { hypeE = Math.min(1, hypeNow() + amount); hypeAt = Date.now(); },
  /** Volume relatif 0..1, mis. diturunkan saat animasi penutup tampil. */
  level(x: number) {
    musicLevel = Math.max(0, Math.min(1, x));
    const c = ctx; if (c && musicBus) musicBus.gain.setTargetAtTime(MUSIC_BASE * musicLevel, c.currentTime, 0.3);
  },
};

/**
 * Efek suara overlay. Semua disintesis dengan WebAudio (tanpa berkas audio), jadi ringan untuk OBS / TikTok LIVE Studio.
 * Pemanggil cukup `sfx.xxx()`; kalau suara dimatikan (pengaturan / pratinjau dashboard) semua panggilan diam saja.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = false;
let lastAt: Record<string, number> = {};

/** Nyalakan/matikan semua suara. Dipanggil OverlayView menurut `state.sound` dan mode pratinjau. */
export function setSfxEnabled(on: boolean) { enabled = on; }

function ac(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); // supaya banyak suara sekaligus tidak pecah
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Browser kadang memblokir suara sebelum ada interaksi; satu klik/tombol di halaman membukanya. */
export function unlockSfx() {
  if (typeof window === "undefined") return;
  const go = () => { const c = ac(); if (c && c.state === "suspended") void c.resume(); };
  window.addEventListener("pointerdown", go, { once: true });
  window.addEventListener("keydown", go, { once: true });
}

/** Batasi pemanggilan beruntun supaya tidak menumpuk (mis. banyak vote dalam sekejap). */
function gate(key: string, ms: number): boolean {
  const now = Date.now();
  if (now - (lastAt[key] ?? 0) < ms) return false;
  lastAt[key] = now;
  return true;
}

type Wave = OscillatorType;
/** Satu nada: gelombang `type`, frekuensi `f` (opsional meluncur ke `f2`), mulai `t` detik dari sekarang. */
function tone(f: number, dur: number, o: { t?: number; type?: Wave; vol?: number; f2?: number; attack?: number; detune?: number } = {}) {
  const c = ac(); if (!c || !master) return;
  const t0 = c.currentTime + (o.t ?? 0);
  const osc = c.createOscillator(); const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
  if (o.detune) osc.detune.value = o.detune;
  const v = o.vol ?? 0.2; const a = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

/** Desis noise tersaring: dasar suara whoosh, klik, ledakan. */
function noise(dur: number, o: { t?: number; vol?: number; from?: number; to?: number; q?: number; type?: BiquadFilterType } = {}) {
  const c = ac(); if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (o.t ?? 0);
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = o.type ?? "bandpass"; f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.from ?? 800, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
  const g = c.createGain(); const v = o.vol ?? 0.15;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

/** Pentatonik mayor C: apa pun urutannya selalu enak didengar. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const note = (i: number) => PENTA[Math.max(0, Math.min(PENTA.length - 1, i))]!;

export const sfx = {
  /** Item baru tayang: whoosh masuk + arpeggio ceria. Warna nada beda tiap gimmick. */
  enter(gimmick?: string) {
    if (!gate("enter", 250)) return;
    noise(0.35, { from: 500, to: 3200, vol: 0.1, q: 0.8 });
    const base = gimmick === "confession" || gimmick === "audience" ? [0, 2, 4] : gimmick === "chaos" ? [4, 1, 3, 0] : gimmick === "hottake" ? [0, 3, 5] : gimmick === "spin" ? [0, 1, 2, 3, 4] : gimmick === "card" ? [2, 4, 6] : [0, 2, 3, 5];
    base.forEach((n, i) => {
      tone(note(n), 0.28, { t: 0.08 + i * 0.07, type: "triangle", vol: 0.16 });
      tone(note(n) * 2, 0.2, { t: 0.08 + i * 0.07, type: "sine", vol: 0.05 });
    });
  },
  /** Ganti jenis gimmick: sapuan naik + kilau. */
  swoosh() {
    if (!gate("swoosh", 600)) return;
    noise(0.6, { from: 300, to: 5000, vol: 0.13, q: 0.7 });
    tone(330, 0.5, { type: "sawtooth", f2: 990, vol: 0.05 });
    [8, 9, 7].forEach((n, i) => tone(note(n), 0.25, { t: 0.4 + i * 0.07, type: "sine", vol: 0.09 }));
  },
  /** Vote masuk: pop yang naik nadanya selama vote beruntun, makin ramai makin seru. */
  vote(streak = 0, count = 1) {
    if (!gate("vote", 70)) return;
    const i = Math.min(PENTA.length - 1, streak % 10);
    tone(note(i), 0.16, { type: "triangle", vol: 0.17, f2: note(i) * 1.02 });
    tone(note(i) / 2, 0.1, { type: "sine", vol: 0.1 });
    if (count > 1) [0, 1, 2].forEach((k) => tone(note(Math.min(9, i + 2 + k)), 0.12, { t: 0.05 + k * 0.045, type: "triangle", vol: 0.1 }));
    if (streak > 0 && streak % 10 === 0) { [5, 7, 9].forEach((n, k) => tone(note(n), 0.3, { t: 0.08 + k * 0.06, type: "square", vol: 0.05 })); } // kelipatan 10: bonus
  },
  /** Ada yang menyalip: sirene naik + fanfare pendek. */
  overtake() {
    if (!gate("overtake", 800)) return;
    tone(260, 0.35, { type: "sawtooth", f2: 880, vol: 0.09 });
    noise(0.3, { from: 400, to: 4000, vol: 0.08 });
    [2, 4, 6, 8].forEach((n, i) => tone(note(n), 0.22, { t: 0.18 + i * 0.07, type: "square", vol: 0.07 }));
    tone(note(8), 0.5, { t: 0.5, type: "triangle", vol: 0.14 });
  },
  /** Detik hitung mundur. `urgent` = 3-2-1 terakhir (lebih tinggi & tebal). */
  tick(urgent = false) {
    if (!gate("tick", 120)) return;
    if (urgent) { tone(880, 0.12, { type: "square", vol: 0.1 }); tone(440, 0.18, { type: "sine", vol: 0.14 }); } else tone(1200, 0.04, { type: "square", vol: 0.04 });
  },
  /** Waktu habis: gong + pembuka hasil. */
  timeUp() {
    tone(196, 0.9, { type: "sine", vol: 0.25 }); tone(392, 0.7, { type: "triangle", vol: 0.1 });
    noise(0.4, { from: 2400, to: 400, vol: 0.08, q: 0.6 });
  },
  /** Pemenang: fanfare mayor dengan akor penutup. */
  win() {
    if (!gate("win", 1000)) return;
    [0, 2, 3, 5].forEach((n, i) => tone(note(n), 0.26, { t: i * 0.09, type: "square", vol: 0.07 }));
    [0, 2, 4, 5].forEach((n) => tone(note(n), 0.9, { t: 0.4, type: "triangle", vol: 0.12 }));
    noise(0.5, { t: 0.4, from: 6000, to: 9000, vol: 0.05, type: "highpass" }); // konfeti
  },
  /** Seri: dua nada saling ragu. */
  tie() { [4, 3, 4, 3].forEach((n, i) => tone(note(n), 0.18, { t: i * 0.14, type: "triangle", vol: 0.13 })); },
  /** Sepi / tidak ada suara: nada turun ala "wah-wah". */
  none() { [4, 3, 2, 0].forEach((n, i) => tone(note(n) / 2, 0.3, { t: i * 0.2, type: "sawtooth", vol: 0.07, f2: note(n) / 2.2 })); },
  /** Cap hasil menghantam layar (Hot Take). */
  stamp(kind: "agree" | "disagree" | "tie" | "none" = "agree") {
    tone(140, 0.35, { type: "sine", f2: 45, vol: 0.4 });
    noise(0.18, { from: 1800, to: 300, vol: 0.2, q: 0.5 });
    if (kind === "agree") [3, 5, 7].forEach((n, i) => tone(note(n), 0.4, { t: 0.1 + i * 0.07, type: "triangle", vol: 0.12 }));
    else if (kind === "disagree") { tone(110, 0.5, { t: 0.08, type: "sawtooth", f2: 70, vol: 0.12 }); tone(98, 0.5, { t: 0.08, type: "square", vol: 0.05 }); }
    else if (kind === "tie") sfx.tie();
    else sfx.none();
  },
  /** Meteran Hot Take terisi: sapuan naik halus. */
  meter() { tone(300, 1, { type: "sine", f2: 900, vol: 0.06, attack: 0.2 }); },
  /** Segel rahasia (Confession): klik kunci + gema rendah. */
  seal() {
    noise(0.05, { from: 3500, vol: 0.2, q: 4 }); tone(1800, 0.06, { type: "square", vol: 0.06 });
    tone(110, 0.9, { t: 0.04, type: "sine", f2: 70, vol: 0.3 });
    [0, 2, 4].forEach((n, i) => tone(note(n) / 2, 1, { t: 0.2 + i * 0.05, type: "sine", vol: 0.08 }));
  },
  /** Teaser confession selesai: kilau misterius. */
  reveal() { [2, 5, 3, 7].forEach((n, i) => tone(note(n), 0.35, { t: i * 0.08, type: "sine", vol: 0.1 })); noise(0.5, { from: 4000, to: 9000, vol: 0.04, type: "highpass" }); },
  /** Pusaran Random Chaos: sapuan turun + glitch. */
  vortex() {
    tone(900, 1.8, { type: "sawtooth", f2: 60, vol: 0.1, attack: 0.05 });
    noise(1.6, { from: 3000, to: 200, vol: 0.12, q: 2 });
    for (let i = 0; i < 6; i++) tone(200 + Math.random() * 1400, 0.05, { t: 0.2 + i * 0.22, type: "square", vol: 0.05 });
  },
  /** Kata Chaos berguling. */
  roll(i = 0) { tone(300 + (i % 6) * 70, 0.05, { type: "square", vol: 0.035 }); },
  /** Kata Chaos berhenti: dentuman + akor. */
  lock() { tone(120, 0.3, { type: "sine", f2: 60, vol: 0.3 }); [0, 2, 4].forEach((n, i) => tone(note(n), 0.5, { t: 0.04 + i * 0.06, type: "triangle", vol: 0.12 })); },
  /** Klik roda tiap melewati satu irisan. `speed` 0..1 menentukan tinggi nada. */
  wheel(speed = 0.5) {
    if (!gate("wheel", 38)) return;
    tone(520 + speed * 520, 0.04, { type: "triangle", vol: 0.12 });
    noise(0.02, { from: 4000, vol: 0.06, q: 3 });
  },
  /** Roda berhenti di pemenang. */
  wheelWin() { sfx.win(); tone(70, 0.4, { type: "sine", vol: 0.3, f2: 40 }); },
  /** Kartu dikocok. */
  shuffle() { for (let i = 0; i < 7; i++) noise(0.07, { t: i * 0.07, from: 2500 + (i % 2) * 1500, vol: 0.08, q: 1.5 }); },
  /** Kartu dibagi / ditempatkan. */
  deal(i = 0) { noise(0.09, { t: i * 0.08, from: 1500, to: 4500, vol: 0.1, q: 1 }); tone(300, 0.06, { t: i * 0.08, type: "triangle", vol: 0.05 }); },
  /** Kartu dibalik. */
  flip() {
    noise(0.22, { from: 1200, to: 5000, vol: 0.12, q: 0.8 });
    [4, 6, 8].forEach((n, i) => tone(note(n), 0.3, { t: 0.2 + i * 0.07, type: "triangle", vol: 0.12 }));
  },
  /** Ada item baru masuk roda / deck. */
  add() { tone(note(4), 0.12, { type: "triangle", vol: 0.14 }); tone(note(7), 0.2, { t: 0.09, type: "triangle", vol: 0.14 }); },
  /** Banner gift: koin + kilau. */
  gift() {
    tone(988, 0.08, { type: "square", vol: 0.08 }); tone(1319, 0.5, { t: 0.08, type: "square", vol: 0.08 });
    [6, 8, 9, 7, 9].forEach((n, i) => tone(note(n), 0.2, { t: 0.2 + i * 0.06, type: "sine", vol: 0.08 }));
  },
};

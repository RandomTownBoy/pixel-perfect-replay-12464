import { useSyncExternalStore } from "react";
import { clampInt, LIMITS } from "@/lib/limits";

export type GimmickId = "spin" | "thisorthat" | "card" | "hottake" | "confession" | "chaos";

export const GIMMICKS: { id: GimmickId; name: string; emoji: string; tagline: string }[] = [
  { id: "spin", name: "Spin the Question", emoji: "🎡", tagline: "Putar roda, jawab jujur" },
  { id: "thisorthat", name: "This or That", emoji: "⚡", tagline: "Pilih satu, gak boleh dua" },
  { id: "card", name: "Pick a Card", emoji: "🃏", tagline: "Kartu misteri pilihanmu" },
  { id: "hottake", name: "Hot Take", emoji: "🔥", tagline: "Opini panas hari ini" },
  { id: "confession", name: "Confession Time", emoji: "🤫", tagline: "Ngaku aja, aman kok" },
  { id: "chaos", name: "Random Chaos", emoji: "🌀", tagline: "Absurd tapi seru" },
];

export const DEFAULT_CATEGORIES = [
  "Daily Life", "Friendship", "School and College", "Love and Relationships", "Funny Experiences",
  "Overthinking", "Personal Habits", "Money and Shopping", "Random Thoughts", "Deep Questions", "Weird Questions",
];

export type Question = {
  id: string; text: string; gimmick: GimmickId; category: string;
  createdAt: number; favorite: boolean; used: boolean; demo?: boolean; collection?: string;
};
export type Activity = { id: string; text: string; at: number };
export type Settings = {
  creatorName: string; accent: "purple" | "blue" | "pink" | "yellow"; textScale: number;
  visualEffect: "spotlight" | "meteor" | "aurora" | "orbit" | "prism";
  sound: boolean; overlayWidth: number; overlayHeight: number; showTitle: boolean; showBadge: boolean;
  countdown: number; giftRules: GiftRule[];
  /** Posisi tulisan panduan interaksi di overlay. */
  guidePosition: "tr" | "tl" | "br" | "bl" | "off";
  /** Kata tambahan untuk detektor kata tidak pantas (digabung dengan daftar bawaan di database). */
  bannedWords: string[];
  /** Batas total diamond untuk tier ⭐ Supporter, 💎 VIP, 👑 Sultan. */
  vipTiers: [number, number, number];
  /** Hitung VIP hanya dari gift setelah waktu ini (ms). 0 = 12 jam terakhir. */
  vipSince: number;
  /** Tier minimal untuk jalur fast track (0 = mati, 1 = ⭐ semua gifter, 2 = 💎, 3 = 👑). */
  fastTrackTier: 0 | 1 | 2 | 3;
  /** Tampilkan notifikasi tiap gift di overlay. */
  giftNotify: boolean;
  /** Kartu penonton (Pick a Card) langsung disetujui dan masuk pack "Dari Penonton". Mati = ditahan di Inbox sampai host menyetujui. */
  autoApproveCards: boolean;
  /** Antrean habis: otomatis pindah ke jenis antrean lain yang punya kiriman menunggu (jenis lain harus auto ON). Mati = tetap armed dan menunggu input. */
  autoSwitchQueue: boolean;
  /** Anti duplikat/spam: kiriman yang sama atau mirip (termasuk lintas gimmick) dan pengirim yang terlalu sering masuk ke tab Cek; satu suara per penonton. */
  antiDuplicate: boolean;
  /** Alamat publik untuk link penonton (mis. https://situsmu.lovable.app). Kosong = pakai alamat halaman ini. */
  publicUrl: string;
  /** Kapasitas pertanyaan penonton yang belum digunakan. */
  spinCapacity: number;
  /** Jumlah pertanyaan aktif yang ditampilkan sebagai irisan roda. */
  spinSlices: number;
  /** Moderasi pertanyaan Spin: otomatis atau ditahan untuk persetujuan host. */
  spinModeration: "auto" | "manual";
  /** Lama tiap kiriman penonton tampil di overlay (detik) per gimmick. Batas atas = QUEUE_SECONDS, batas bawah = LIMITS.queueMinSeconds. */
  queueDurations: Record<QueueKind, number>;
};
export type QueueKind = "confession" | "hottake" | "chaos" | "thisorthat";

/** Jendela input penonton: mana yang sedang menerima kiriman. */
export type Intake = { spin: boolean; card: boolean; confession: boolean; thisorthat: boolean; hottake: boolean; chaos: boolean; followersOnly: boolean };
export const DEFAULT_INTAKE: Intake = { spin: false, card: true, confession: true, thisorthat: true, hottake: true, chaos: true, followersOnly: false };

/** Fase Spin the Question di overlay: roda siap (standby) → berputar → berhenti di pemenang (result). */
export type SpinPhase = "standby" | "spinning" | "result";
/** Fase Pick a Card di overlay: kartu tertutup (standby) → dikocok → dibagikan → satu kartu dibuka. */
export type CardPhase = "standby" | "shuffling" | "dealt" | "revealed";

export type OverlayPayload =
  | {
    gimmick: "spin"; question?: string | undefined; category?: string | undefined; spinning?: boolean | undefined;
    /** Kosong = perilaku lama (hanya "Memutar…" lalu teks hasil). */
    phase?: SpinPhase | undefined;
    /** Isi roda (maks. SPIN_WHEEL_MAX), urutannya = penomoran segmen. */
    items?: string[] | undefined;
    /** Sudut roda kumulatif (derajat) di akhir fase ini. */
    rotation?: number | undefined;
    /** Sudut awal putaran (fase spinning), supaya overlay yang dimuat ulang bisa melanjutkan animasi. */
    fromRotation?: number | undefined;
    durationMs?: number | undefined; startedAt?: number | undefined; winnerIndex?: number | undefined;
    /** Item yang baru masuk roda + kapan, untuk animasi masuk dan chip "Ditambahkan ke roda". */
    added?: string[] | undefined; addedAt?: number | undefined;
    /** Fase result/spinning: pertanyaan baru yang sudah masuk antrean roda tapi menunggu putaran berikutnya (roda tidak diubah di tengah hasil). */
    queued?: number | undefined; queuedAt?: number | undefined;
  }
  | { gimmick: "thisorthat"; a?: string | undefined; b?: string | undefined; countdownEnd?: number | undefined }
  | { gimmick: "card"; count: number; revealed?: number | undefined; /** Urutan indeks kartu yang sudah dibuka di deck ini; tetap terbuka sampai deck diganti. */ opened?: number[] | undefined; text?: string | undefined; phase?: CardPhase | undefined;
    /** Nama deck yang tayang, supaya kartu baru yang masuk ke deck ini bisa disinkronkan real time. */ deck?: string | undefined;
    /** Jumlah kartu yang baru masuk + kapan, untuk animasi masuk dan chip "Kartu baru masuk". */ added?: number | undefined; addedAt?: number | undefined }
  | { gimmick: "hottake"; topic?: string | undefined; followups?: string[] | undefined }
  | { gimmick: "confession"; prompt?: string | undefined; category?: string | undefined }
  | { gimmick: "chaos"; mode: "story"; words: string[]; /** Kata sedang diacak (animasi gulir) di overlay. */ rolling?: boolean | undefined }
  | { gimmick: "chaos"; mode: "solution"; problem: string; solutions: string[] }
  | { gimmick: "audience"; kind: string; content: string; nickname?: string | undefined };

export type SpinPayload = Extract<OverlayPayload, { gimmick: "spin" }>;
export type CardPayload = Extract<OverlayPayload, { gimmick: "card" }>;

/** Jumlah item maksimal di roda, durasi & easing putaran (sama di dashboard dan overlay). */
export const SPIN_WHEEL_MAX = 300;
/** Lama tiap kiriman penonton tampil di overlay (detik), menurut jenis gimmick. Host bisa menahan atau melompat lewat tombol di Kontrol. */
/** Durasi tayang maksimum (dan bawaan) tiap gimmick. Host boleh menguranginya di Settings, tidak boleh melebihinya. */
export const QUEUE_SECONDS: Record<QueueKind, number> = { confession: 180, hottake: 120, chaos: 120, thisorthat: 90 };
export const QUEUE_KIND_LIST: QueueKind[] = ["confession", "hottake", "chaos", "thisorthat"];
/** Durasi tayang (detik) yang berlaku untuk satu jenis kiriman: pengaturan host, dijepit antara batas bawah dan QUEUE_SECONDS. */
export const queueSecondsFor = (kind: string) => {
  const max = (QUEUE_SECONDS as Record<string, number>)[kind] ?? 120;
  const set = (getSettings().queueDurations as Partial<Record<string, number>> | undefined)?.[kind];
  return clampInt(set, Math.min(LIMITS.queueMinSeconds, max), max, max);
};
export const SPIN_DURATION_MS = 3500;
export const SPIN_EASING = "cubic-bezier(.15,.85,.2,1)";
/** Isi roda untuk satu kategori: sumber tunggal dipakai dashboard, overlay, dan sinkronisasi otomatis. */
export function spinPoolOf(qs: Question[], category: string, limit = SPIN_WHEEL_MAX): Question[] {
  const available = qs.filter((q) => q.gimmick === "spin" && q.category === category && !q.used);
  if (category === VIEWER_CATEGORY) available.sort((a, b) => a.createdAt - b.createdAt);
  return available.slice(0, Math.max(1, Math.min(SPIN_WHEEL_MAX, limit)));
}

export type GiftRule = { id: string; name: string; emoji: string; effect: "vote" | "shoutout"; weight: number; reward: string };

export type OverlayState = {
  visible: boolean; payload: OverlayPayload | null; updatedAt: number; payloadAt: number;
  votes?: { a: number; b: number } | undefined;
  banner?: { text: string; at: number } | undefined;
  audienceCode?: string | undefined;
  accent: Settings["accent"]; textScale: number; visualEffect?: Settings["visualEffect"]; sound: boolean; showTitle: boolean; showBadge: boolean;
  intake?: Intake | undefined;
  guidePos?: Settings["guidePosition"] | undefined;
  /** Hanya ada selama masih ada kiriman yang menunggu giliran: overlay menggambar garis loading kiri→kanan selama item ini tayang. */
  queue?: { pending: number; ms: number; startedAt: number; pausedAt?: number | undefined } | undefined;
  /**
   * Animasi penutup: waktu tayang item antrean habis, overlay memainkan animasi sesuai gimmick (setuju/tidak, pemenang pilihan,
   * segel rahasia, pusaran chaos) sebelum item berikutnya tampil. Dihapus otomatis saat payload baru dikirim.
   */
  outro?: Outro | undefined;
};
export type Outro = {
  at: number; ms: number;
  /** Suara yang dibekukan saat animasi mulai, supaya hasilnya tidak berubah-ubah selama animasi. */
  votes?: { a: number; b: number } | undefined;
  /** True kalau ini item terakhir: lapisan animasi memudar di akhir (kalau tidak, item berikutnya langsung menggantikan). */
  fade?: boolean | undefined;
};
/** Lama animasi penutup di overlay (ms) sebelum lanjut ke item antrean berikutnya. */
export const OUTRO_MS = 3600;

type State = { questions: Question[]; categories: string[]; activity: Activity[]; settings: Settings };

// Harus berformat UUID asli: kolom questions.id di database bertipe uuid.
const uid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};
const now = Date.now();
// Seed rows are built at module load, where the live server forbids random values: use fixed ids.
let seedCount = 0;
const q = (text: string, gimmick: GimmickId, category: string): Question => ({
  id: `00000000-0000-4000-8000-${String(++seedCount).padStart(12, "0")}`, text, gimmick, category, createdAt: now, favorite: false, used: false, demo: true,
});

export const DEMO = {
  thisOrThat: [
    ["Rebahan di rumah", "Jalan-jalan keluar"], ["Kaya tapi sibuk", "Bebas tapi biasa aja"],
    ["Bisa baca pikiran", "Bisa lihat masa depan"], ["Mie instan tengah malam", "Martabak manis"],
    ["Chat panjang", "Voice note 5 menit"], ["Pantai", "Gunung"], ["Bangun jam 5", "Begadang sampai jam 3"],
  ] as [string, string][],
  hotTakes: [
    "Bales chat kelamaan itu bukan sibuk, tapi emang gak prioritas.",
    "Nasi padang lebih enak dibungkus daripada makan di tempat.",
    "Liburan di rumah aja itu valid dan underrated.",
    "Orang yang suka voice note harusnya bikin podcast aja.",
    "Mandi malam itu lebih penting dari mandi pagi.",
  ],
  confessions: [
    "Pernah pura-pura ngerti padahal dari tadi gak dengerin?",
    "Hal paling random yang pernah kamu tangisin apa?",
    "Pernah salah kirim chat ke orang yang salah? Ceritain!",
    "Kebiasaan aneh kamu yang gak ada yang tahu?",
    "Pernah ketiduran di tempat yang gak seharusnya?",
  ],
  words: ["kucing", "sendal jepit", "mantan", "rice cooker", "alien", "ojol", "kulkas", "dosen", "cilok", "hujan",
    "payung", "tetangga", "galon", "kecoa", "drama korea", "wifi", "nenek", "bebek", "kipas angin", "seblak"],
  problems: [
    "Charger cuma nyampe kalau HP digantung di udara.",
    "Tetangga karaoke tiap jam 2 pagi.",
    "Kucing tidur di atas keyboard pas lagi kerja.",
    "Lupa password akun yang baru dibikin 5 menit lalu.",
  ],
  solutions: [
    "Pindah rumah ke sebelah colokan.", "Ajak duet aja sekalian biar adil.", "Beli keyboard kedua khusus kucing.",
    "Bikin password 'lupa' biar gampang inget.", "Pura-pura jadi robot sampai masalahnya hilang sendiri.",
    "Telepon ibu, pasti beliau punya solusi.", "Tidur dulu, siapa tahu besok udah beres.",
  ],
  followups: [
    "Terus abis itu kamu ngapain?", "Kalau diulang, kamu bakal tetap pilih itu?",
    "Siapa orang pertama yang kamu ceritain?", "Kenapa menurutmu itu kejadian?", "Ada yang pernah ngalamin juga gak di chat?",
  ],
};

const seedQuestions: Question[] = [
  q("Hal kecil apa yang bisa bikin mood kamu bagus seharian?", "spin", "Daily Life"),
  q("Kebiasaan pagi kamu yang paling gak penting tapi wajib?", "spin", "Daily Life"),
  q("Teman yang paling sering bikin kamu ketawa itu kayak gimana?", "spin", "Friendship"),
  q("Pernah ngambek sama teman gara-gara hal sepele?", "spin", "Friendship"),
  q("Guru atau dosen paling legendaris yang pernah kamu temui?", "spin", "School and College"),
  q("Alasan paling kreatif buat bolos yang pernah kamu pakai?", "spin", "School and College"),
  q("Red flag paling kecil yang bikin kamu ilfeel?", "spin", "Love and Relationships"),
  q("Kejadian paling memalukan di tempat umum?", "spin", "Funny Experiences"),
  q("Overthinking paling gak masuk akal yang pernah kamu alami?", "spin", "Overthinking"),
  q("Barang paling gak berguna yang pernah kamu beli?", "spin", "Money and Shopping"),
  q("Kalau hewan bisa ngomong, mana yang paling julid?", "spin", "Weird Questions"),
  q("Kapan terakhir kamu merasa benar-benar bangga sama diri sendiri?", "spin", "Deep Questions"),
  q("Kalau kamu jadi kentang, mau diolah jadi apa?", "card", "Weird Questions"),
  q("Lagu yang selalu kamu skip tapi diam-diam suka?", "card", "Random Thoughts"),
  q("Kebiasaan yang mau kamu hentikan tahun ini?", "card", "Personal Habits"),
  q("Satu kata buat menggambarkan minggu ini?", "card", "Daily Life"),
  q("Makanan yang bikin kamu kangen rumah?", "card", "Daily Life"),
  q("Hal yang kamu pelajari dari patah hati?", "card", "Deep Questions"),
  ...DEMO.hotTakes.map((t) => q(t, "hottake", "Random Thoughts")),
  ...DEMO.confessions.map((t) => q(t, "confession", "Funny Experiences")),
];

const KEY = "kyoka:state:v1";
const OVERLAY_KEY = "kyoka:overlay:v1";

const defaultState: State = {
  questions: seedQuestions,
  categories: DEFAULT_CATEGORIES,
  activity: [{ id: "demo-start", text: "Demo Mode aktif — data contoh dimuat", at: now }],
  settings: {
    creatorName: "Kyoka", accent: "purple", textScale: 1, visualEffect: "spotlight", sound: true,
    overlayWidth: 1080, overlayHeight: 1920, showTitle: true, showBadge: true, countdown: 10,
    guidePosition: "tr", bannedWords: [], vipTiers: [1, 100, 1000], vipSince: 0, fastTrackTier: 1, giftNotify: true, autoApproveCards: true, autoSwitchQueue: true, antiDuplicate: true, publicUrl: "", spinCapacity: 30, spinSlices: 10, spinModeration: "auto", queueDurations: { ...QUEUE_SECONDS },
    giftRules: [
      { id: "rose", name: "Rose", emoji: "🌹", effect: "vote", weight: 1, reward: "+1 suara" },
      { id: "heart", name: "Finger Heart", emoji: "🫰", effect: "vote", weight: 5, reward: "+5 suara" },
      { id: "donut", name: "Donut", emoji: "🍩", effect: "vote", weight: 10, reward: "+10 suara" },
      { id: "galaxy", name: "Galaxy", emoji: "🌌", effect: "shoutout", weight: 0, reward: "Boleh pilih pertanyaan berikutnya!" },
      { id: "lion", name: "Lion", emoji: "🦁", effect: "shoutout", weight: 0, reward: "Kyoka wajib jawab jujur 1 pertanyaan!" },
    ],
  },
};

/**
 * Jepit semua pengaturan numerik ke batas yang masuk akal (tidak minus, tidak melebihi kapasitas, urutan tier benar).
 * Dipakai setiap kali pengaturan berubah atau dimuat (localStorage / database), jadi data lama yang rusak pun ikut dibetulkan.
 * Mengembalikan objek yang sama kalau tidak ada yang berubah (supaya tidak memicu penyimpanan ulang).
 */
export function normalizeSettings(s: Settings): Settings {
  const d = defaultState.settings;
  const patch: Partial<Settings> = {};
  const visualEffects: Settings["visualEffect"][] = ["spotlight", "meteor", "aurora", "orbit", "prism"];
  if (!visualEffects.includes(s.visualEffect)) patch.visualEffect = d.visualEffect;
  const spinCapacity = clampInt(s.spinCapacity, LIMITS.spin.min, LIMITS.spin.max, d.spinCapacity);
  // Irisan roda tidak boleh melebihi kapasitas.
  const spinSlices = clampInt(s.spinSlices, LIMITS.spin.min, Math.min(LIMITS.spin.max, spinCapacity), Math.min(d.spinSlices, spinCapacity));
  if (spinCapacity !== s.spinCapacity) patch.spinCapacity = spinCapacity;
  if (spinSlices !== s.spinSlices) patch.spinSlices = spinSlices;
  const countdown = clampInt(s.countdown, LIMITS.countdown.min, LIMITS.countdown.max, d.countdown);
  if (countdown !== s.countdown) patch.countdown = countdown;
  const ow = clampInt(s.overlayWidth, LIMITS.overlaySize.min, LIMITS.overlaySize.max, d.overlayWidth);
  const oh = clampInt(s.overlayHeight, LIMITS.overlaySize.min, LIMITS.overlaySize.max, d.overlayHeight);
  if (ow !== s.overlayWidth) patch.overlayWidth = ow;
  if (oh !== s.overlayHeight) patch.overlayHeight = oh;
  const ts = Number.isFinite(Number(s.textScale)) ? Math.round(Math.min(LIMITS.textScale.max, Math.max(LIMITS.textScale.min, Number(s.textScale))) * 10) / 10 : d.textScale;
  if (ts !== s.textScale) patch.textScale = ts;
  // Tier VIP harus naik: Supporter < VIP < Sultan.
  const [a0, b0, c0] = Array.isArray(s.vipTiers) ? s.vipTiers : d.vipTiers;
  const t1 = clampInt(a0, LIMITS.vipDiamonds.min, LIMITS.vipDiamonds.max, d.vipTiers[0]);
  const t2 = clampInt(b0, t1 + 1, LIMITS.vipDiamonds.max + 1, Math.max(d.vipTiers[1], t1 + 1));
  const t3 = clampInt(c0, t2 + 1, LIMITS.vipDiamonds.max + 2, Math.max(d.vipTiers[2], t2 + 1));
  if (!Array.isArray(s.vipTiers) || s.vipTiers[0] !== t1 || s.vipTiers[1] !== t2 || s.vipTiers[2] !== t3) patch.vipTiers = [t1, t2, t3];
  // Durasi antrean: min LIMITS.queueMinSeconds, maks QUEUE_SECONDS.
  const qd = {} as Record<QueueKind, number>;
  let qdChanged = !s.queueDurations;
  for (const k of QUEUE_KIND_LIST) {
    const max = QUEUE_SECONDS[k];
    qd[k] = clampInt(s.queueDurations?.[k], Math.min(LIMITS.queueMinSeconds, max), max, max);
    if (s.queueDurations?.[k] !== qd[k]) qdChanged = true;
  }
  if (qdChanged) patch.queueDurations = qd;
  // Bobot gift (suara) minimal 1.
  if (Array.isArray(s.giftRules) && s.giftRules.some((r) => clampInt(r.weight, LIMITS.giftWeight.min, LIMITS.giftWeight.max, 1) !== r.weight)) {
    patch.giftRules = s.giftRules.map((r) => ({ ...r, weight: clampInt(r.weight, LIMITS.giftWeight.min, LIMITS.giftWeight.max, 1) }));
  }
  return Object.keys(patch).length ? { ...s, ...patch } : s;
}

let state: State = defaultState;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const j = JSON.parse(raw); state = { ...defaultState, ...j, settings: normalizeSettings({ ...defaultState.settings, ...j.settings }) }; }
  } catch { /* ignore */ }
}

let silent = false;
const persistListeners = new Set<() => void>();
function setState(fn: (s: State) => State) {
  load();
  const prev = state;
  state = fn(state);
  if (state.settings !== prev.settings) { const n = normalizeSettings(state.settings); if (n !== state.settings) state = { ...state, settings: n }; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  if (prev.questions !== state.questions) { syncSpinWheel(); syncCardDeck(); }
  if (!silent && (prev.settings !== state.settings || prev.categories !== state.categories)) persistListeners.forEach((l) => l());
}
/** Dipanggil saat pengaturan atau kategori berubah oleh pengguna (bukan saat dimuat dari database). */
export function onPersistChange(cb: () => void) { persistListeners.add(cb); return () => { persistListeners.delete(cb); }; }
/** Terapkan pengaturan dari database tanpa memicu penyimpanan balik. */
export function replaceSettings(patch: Partial<Settings>) {
  silent = true;
  try { setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })); } finally { silent = false; }
}
export function replaceCategories(list: string[]) {
  silent = true;
  try { setState((s) => ({ ...s, categories: [...new Set([...s.categories, ...list])] })); } finally { silent = false; }
}
export function getCategories() { load(); return state.categories; }

export function useKyoka<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => { load(); return sel(state); },
    () => sel(defaultState),
  );
}

export type Remote = {
  insert: (q: Question[]) => void; update: (id: string, p: Partial<Question>) => void; remove: (id: string) => void;
  overlay: (s: OverlayState) => void;
};
let remote: Remote | null = null;
export function setRemote(r: Remote | null) { remote = r; }
/** True kalau sudah tersambung ke database (aman untuk menyimpan). */
export const hasRemote = () => remote !== null;
/** Kategori khusus untuk konten yang berasal dari kiriman penonton. */
export const VIEWER_CATEGORY = "Dari Penonton";
/**
 * Perubahan lokal yang baru saja dikirim ke database (mis. kartu ditandai terpakai, atau dihapus).
 * Dipertahankan beberapa detik supaya muat ulang dari database yang kebetulan lebih lama (balapan dengan kiriman penonton)
 * tidak menimpanya. Kalau database gagal, entri dibuang lewat settleQuestion() dan data asli yang dipakai.
 */
const PENDING_MS = 8000;
const pendingPatch = new Map<string, { patch: Partial<Question>; at: number }>();
const pendingDelete = new Map<string, number>();
export function settleQuestion(id: string) { pendingPatch.delete(id); pendingDelete.delete(id); }
export function replaceQuestions(qs: Question[]) {
  const now = Date.now();
  for (const [id, v] of pendingPatch) if (now - v.at > PENDING_MS) pendingPatch.delete(id);
  for (const [id, at] of pendingDelete) if (now - at > PENDING_MS) pendingDelete.delete(id);
  const fresh = qs.filter((q) => !pendingDelete.has(q.id)).map((q) => { const p = pendingPatch.get(q.id); return p ? { ...q, ...p.patch } : q; });
  // Kategori dimuat dari isi database juga, supaya konten tidak "hilang" dari dropdown kalau localStorage kosong/ganti perangkat.
  // Nama deck Pick a Card ("Penonton #1", dst.) bukan kategori: tidak ikut dimuat, dan sisa lama dibersihkan dari daftar.
  setState((s) => {
    const base = s.categories.filter((c) => !/^Penonton #\d+$/.test(c.trim()));
    const merged = [...new Set([...base, ...fresh.filter((q) => q.gimmick !== "card").map((q) => q.category)])];
    const same = merged.length === s.categories.length && merged.every((c, i) => c === s.categories[i]);
    return { ...s, questions: fresh, categories: same ? s.categories : merged };
  });
}
export const SAMPLE_QUESTIONS = () => seedQuestions.map((q) => ({ ...q, id: uid(), createdAt: Date.now() }));

export const actions = {
  log(text: string) {
    setState((s) => ({ ...s, activity: [{ id: uid(), text, at: Date.now() }, ...s.activity].slice(0, 30) }));
  },
  addQuestions(items: { text: string; gimmick: GimmickId; category: string; demo?: boolean }[]) {
    const existing = new Set(state.questions.map((x) => normalize(x.text)));
    const fresh = items.filter((i) => i.text.trim() && !existing.has(normalize(i.text)));
    const rows: Question[] = fresh.map((i) => ({ ...i, id: uid(), createdAt: Date.now(), favorite: false, used: false }));
    setState((s) => ({ ...s, questions: [...rows, ...s.questions] }));
    if (rows.length) remote?.insert(rows);
    if (fresh.length) actions.log(`${fresh.length} konten disimpan ke Question Bank`);
    return fresh.length;
  },
  updateQuestion(id: string, patch: Partial<Question>) {
    pendingPatch.set(id, { patch: { ...pendingPatch.get(id)?.patch, ...patch }, at: Date.now() });
    setState((s) => ({ ...s, questions: s.questions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    remote?.update(id, patch);
  },
  deleteQuestion(id: string) {
    pendingDelete.set(id, Date.now()); pendingPatch.delete(id);
    setState((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== id) }));
    remote?.remove(id);
  },
  addCategory(name: string) {
    if (!name.trim() || state.categories.includes(name.trim())) return;
    setState((s) => ({ ...s, categories: [...s.categories, name.trim()] }));
  },
  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    const o = readOverlay();
    pushOverlay({ ...o, ...pick(patch) });
  },
  resetDemo() {
    // Hanya konten demo dan log aktivitas yang dikembalikan; pengaturan dan kategori tidak disentuh (tidak memicu simpan ke database).
    setState((s) => ({ ...s, questions: [...seedQuestions, ...s.questions.filter((q) => !q.demo)], activity: [{ id: uid(), text: "Data demo di-reset", at: Date.now() }] }));
  },
};

function pick(p: Partial<Settings>): Partial<OverlayState> {
  const out: Partial<OverlayState> = {};
  if (p.accent) out.accent = p.accent;
  if (p.textScale) out.textScale = p.textScale;
  if (p.visualEffect) out.visualEffect = p.visualEffect;
  if (p.sound !== undefined) out.sound = p.sound;
  if (p.showTitle !== undefined) out.showTitle = p.showTitle;
  if (p.showBadge !== undefined) out.showBadge = p.showBadge;
  if (p.guidePosition) out.guidePos = p.guidePosition;
  return out;
}

export function normalize(t: string) {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export function getQuestions() { load(); return state.questions; }
export function getSettings() { load(); return state.settings; }

export function isDuplicate(text: string) {
  const n = normalize(text);
  return state.questions.some((x) => normalize(x.text) === n);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]!; a[i] = a[j]!; a[j] = t; }
  return a;
}
export const sample = <T,>(arr: T[], n: number) => shuffle(arr).slice(0, n);

/* ---------- Overlay realtime channel (same-browser, Demo Mode) ---------- */

export const defaultOverlay = (): OverlayState => ({
  visible: true, payload: null, updatedAt: 0, payloadAt: 0, accent: state.settings.accent, textScale: state.settings.textScale, visualEffect: state.settings.visualEffect,
  sound: state.settings.sound, showTitle: state.settings.showTitle, showBadge: state.settings.showBadge,
});

export function readOverlay(): OverlayState {
  load();
  if (typeof window === "undefined") return defaultOverlay();
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    return raw ? { ...defaultOverlay(), ...JSON.parse(raw) } : defaultOverlay();
  } catch { return defaultOverlay(); }
}

let channel: BroadcastChannel | null = null;
const getChannel = () => {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return (channel ??= new BroadcastChannel("kyoka-overlay"));
};

export function pushOverlay(next: OverlayState) {
  const s = { ...next, updatedAt: Date.now() };
  try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  getChannel()?.postMessage({ type: "state", state: s });
  remote?.overlay(s);
  overlayListeners.forEach((l) => l());
}

const overlayListeners = new Set<() => void>();
export function sendToOverlay(payload: OverlayPayload) {
  const o = readOverlay();
  pushOverlay({ ...o, payload, visible: true, payloadAt: Date.now(), votes: undefined, outro: undefined });
  const g = GIMMICKS.find((x) => x.id === payload.gimmick);
  actions.log(`Overlay: ${g?.name ?? payload.gimmick} dikirim`);
}
/**
 * Ganti payload overlay di tempat: `payloadAt` dan `votes` tidak berubah, jadi kartu overlay tidak remount/berkedip
 * (di OverlayView kartu memakai key={payloadAt}). Dipakai untuk pergantian fase dan penambahan isi roda.
 */
export function updateOverlayPayload(payload: OverlayPayload) {
  const o = readOverlay();
  if (!o.payload) { sendToOverlay(payload); return; }
  pushOverlay({ ...o, payload });
}

/**
 * Kalau roda sedang standby di overlay dan isi pool kategorinya berubah (pertanyaan ditambah/disimpan/dipakai),
 * kirim ulang standby secara in-place. Fase spinning/result tidak disentuh supaya animasi dan pemenang tidak rusak.
 */
function syncSpinWheel() {
  if (typeof window === "undefined") return;
  const o = readOverlay();
  const p = o.payload;
  if (!p || p.gimmick !== "spin" || !p.phase || !p.category) return;
  if (p.phase !== "standby") {
    // Roda tidak diubah saat berputar / menampilkan hasil. Pertanyaan baru hanya dihitung sebagai "menunggu" dan chip-nya muncul real time.
    const known = new Set(p.items ?? []);
    const waiting = spinPoolOf(state.questions, p.category, state.settings.spinSlices).filter((x) => !known.has(x.text)).length;
    if (waiting !== (p.queued ?? 0)) pushOverlay({ ...o, payload: { ...p, queued: waiting || undefined, queuedAt: waiting ? Date.now() : undefined } });
    return;
  }
  const items = spinPoolOf(state.questions, p.category, state.settings.spinSlices).map((x) => x.text);
  const prev = p.items ?? [];
  if (items.length === prev.length && items.every((t, i) => t === prev[i])) return;
  const had = new Set(prev);
  const added = items.filter((t) => !had.has(t));
  pushOverlay({ ...o, payload: { ...p, items, added: added.length ? added : undefined, addedAt: added.length ? Date.now() : undefined } });
}
/** Kartu baru masuk ke deck yang sedang tayang (standby/dealt): jumlah kartu di overlay ikut naik real time, dengan animasi masuk. */
function syncCardDeck() {
  if (typeof window === "undefined") return;
  const o = readOverlay();
  const p = o.payload;
  if (!p || p.gimmick !== "card" || !p.deck || (p.phase !== "standby" && p.phase !== "dealt")) return;
  const count = Math.min(6, state.questions.filter((q) => q.gimmick === "card" && q.category === p.deck).length);
  if (count === p.count || count === 0) return;
  const added = count > p.count ? count - p.count : undefined;
  pushOverlay({ ...o, payload: { ...p, count, opened: (p.opened ?? []).filter((i) => i < count), added, addedAt: added ? Date.now() : undefined } });
}
export function setOverlayVisible(visible: boolean) {
  pushOverlay({ ...readOverlay(), visible });
  actions.log(visible ? "Overlay ditampilkan" : "Overlay disembunyikan");
}
export function setOverlayOutro(outro: Outro | undefined) {
  const o = { ...readOverlay() };
  if (outro) o.outro = outro; else delete o.outro;
  pushOverlay(o);
}
export function setOverlayQueue(queue: OverlayState["queue"]) {
  const o = { ...readOverlay() };
  if (queue) o.queue = queue; else delete o.queue;
  pushOverlay(o);
}
export function showBanner(text: string) {
  pushOverlay({ ...readOverlay(), banner: { text, at: Date.now() } });
}
export function setOverlayVotes(votes: { a: number; b: number }) {
  pushOverlay({ ...readOverlay(), votes });
}
/** Perbarui jendela input + posisi panduan yang dikirim ke overlay (dipakai untuk tulisan panduan penonton). */
export function setOverlayIntake(intake: Intake) {
  pushOverlay({ ...readOverlay(), intake, guidePos: state.settings.guidePosition });
}
export function resetOverlay() {
  pushOverlay({ ...defaultOverlay(), payload: null });
  actions.log("Overlay di-reset");
}

export function subscribeOverlay(cb: (s: OverlayState) => void) {
  const ch = getChannel();
  const onMsg = (e: MessageEvent) => { if (e.data?.type === "state") cb(e.data.state); if (e.data?.type === "ping") ch?.postMessage({ type: "pong" }); };
  const onStorage = (e: StorageEvent) => { if (e.key === OVERLAY_KEY) cb(readOverlay()); };
  const local = () => cb(readOverlay());
  ch?.addEventListener("message", onMsg);
  window.addEventListener("storage", onStorage);
  overlayListeners.add(local);
  return () => { ch?.removeEventListener("message", onMsg); window.removeEventListener("storage", onStorage); overlayListeners.delete(local); };
}

/** Overlay windows answer pings so the dashboard can show connection status. */
export function announceOverlay() {
  const ch = getChannel();
  const onMsg = (e: MessageEvent) => { if (e.data?.type === "ping") ch?.postMessage({ type: "pong" }); };
  ch?.addEventListener("message", onMsg);
  ch?.postMessage({ type: "pong" });
  return () => ch?.removeEventListener("message", onMsg);
}

export function watchOverlayConnection(cb: (connected: boolean) => void) {
  const ch = getChannel();
  if (!ch) { cb(false); return () => {}; }
  let last = 0;
  const onMsg = (e: MessageEvent) => { if (e.data?.type === "pong") { last = Date.now(); cb(true); } };
  ch.addEventListener("message", onMsg);
  const t = setInterval(() => { ch.postMessage({ type: "ping" }); if (Date.now() - last > 5000) cb(false); }, 2000);
  ch.postMessage({ type: "ping" });
  return () => { clearInterval(t); ch.removeEventListener("message", onMsg); };
}

/* ---------- Demo AI generator (no API key needed) ---------- */

const TEMPLATES = {
  default: [
    "Hal paling {adj} soal {topic} yang pernah kamu alami?", "Kalau soal {topic}, kamu tim yang mana?",
    "Ceritain momen {topic} yang sampai sekarang masih kamu inget!", "Apa yang orang gak tahu dari kamu soal {topic}?",
    "Kebiasaan {adj} kamu tentang {topic}?", "Kalau bisa ulang satu momen {topic}, kamu pilih yang mana?",
  ],
};
const ADJ = ["random", "absurd", "memalukan", "lucu", "aneh", "gak terduga", "relate banget"];
const TOPIC: Record<string, string> = {
  "Daily Life": "kehidupan sehari-hari", Friendship: "pertemanan", "School and College": "sekolah atau kuliah",
  "Love and Relationships": "percintaan", "Funny Experiences": "kejadian lucu", Overthinking: "overthinking",
  "Personal Habits": "kebiasaan pribadi", "Money and Shopping": "belanja", "Random Thoughts": "pikiran random",
  "Deep Questions": "hidup", "Weird Questions": "hal-hal aneh",
};

export function demoGenerate(category: string, count: number): string[] {
  const topic = TOPIC[category] ?? category.toLowerCase();
  const out = new Set<string>();
  let guard = 0;
  while (out.size < count && guard++ < 200) {
    const t = (sample(TEMPLATES.default, 1)[0] ?? "").replace("{topic}", topic).replace("{adj}", sample(ADJ, 1)[0] ?? "random");
    if (!isDuplicate(t)) out.add(t);
  }
  return [...out];
}

export const demoImprove = (t: string) => `Jujur deh — ${t.replace(/\?$/, "")}, dan kenapa?`;
export const demoRemix = (t: string, style: string) =>
  ({
    funny: `Versi kocak: ${t.replace(/\?$/, "")}… tapi kamu lagi jadi bebek?`,
    weird: `Bayangin dunia terbalik: ${t}`,
    deep: `Kalau dipikir lebih dalam, ${t.charAt(0).toLowerCase() + t.slice(1)} Apa artinya buat kamu?`,
    unexpected: `Plot twist! ${t} Jawab cuma pakai 3 emoji.`,
  })[style] ?? t;

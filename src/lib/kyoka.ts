import { useSyncExternalStore } from "react";

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
  sound: boolean; overlayWidth: number; overlayHeight: number; showTitle: boolean; showBadge: boolean;
  countdown: number; giftRules: GiftRule[];
};

export type OverlayPayload =
  | { gimmick: "spin"; question?: string | undefined; category?: string | undefined; spinning?: boolean | undefined }
  | { gimmick: "thisorthat"; a?: string | undefined; b?: string | undefined; countdownEnd?: number | undefined }
  | { gimmick: "card"; count: number; revealed?: number | undefined; text?: string | undefined }
  | { gimmick: "hottake"; topic?: string | undefined; followups?: string[] | undefined }
  | { gimmick: "confession"; prompt?: string | undefined; category?: string | undefined }
  | { gimmick: "chaos"; mode: "story"; words: string[] }
  | { gimmick: "chaos"; mode: "solution"; problem: string; solutions: string[] }
  | { gimmick: "audience"; kind: string; content: string; nickname?: string | undefined };

export type GiftRule = { id: string; name: string; emoji: string; effect: "vote" | "shoutout"; weight: number; reward: string };

export type OverlayState = {
  visible: boolean; payload: OverlayPayload | null; updatedAt: number; payloadAt: number;
  votes?: { a: number; b: number } | undefined;
  banner?: { text: string; at: number } | undefined;
  audienceCode?: string | undefined;
  accent: Settings["accent"]; textScale: number; sound: boolean; showTitle: boolean; showBadge: boolean;
};

type State = { questions: Question[]; categories: string[]; activity: Activity[]; settings: Settings };

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const now = Date.now();
const q = (text: string, gimmick: GimmickId, category: string): Question => ({
  id: uid(), text, gimmick, category, createdAt: now, favorite: false, used: false, demo: true,
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
  activity: [{ id: uid(), text: "Demo Mode aktif — data contoh dimuat", at: now }],
  settings: {
    creatorName: "Kyoka", accent: "purple", textScale: 1, sound: true,
    overlayWidth: 1080, overlayHeight: 1920, showTitle: true, showBadge: true, countdown: 10,
    giftRules: [
      { id: "rose", name: "Rose", emoji: "🌹", effect: "vote", weight: 1, reward: "+1 suara" },
      { id: "heart", name: "Finger Heart", emoji: "🫰", effect: "vote", weight: 5, reward: "+5 suara" },
      { id: "donut", name: "Donut", emoji: "🍩", effect: "vote", weight: 10, reward: "+10 suara" },
      { id: "galaxy", name: "Galaxy", emoji: "🌌", effect: "shoutout", weight: 0, reward: "Boleh pilih pertanyaan berikutnya!" },
      { id: "lion", name: "Lion", emoji: "🦁", effect: "shoutout", weight: 0, reward: "Kyoka wajib jawab jujur 1 pertanyaan!" },
    ],
  },
};

let state: State = defaultState;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...defaultState, ...JSON.parse(raw), settings: { ...defaultState.settings, ...JSON.parse(raw).settings } };
  } catch { /* ignore */ }
}

function setState(fn: (s: State) => State) {
  load();
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

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
export function replaceQuestions(qs: Question[]) { setState((s) => ({ ...s, questions: qs })); }
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
    setState((s) => ({ ...s, questions: s.questions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    remote?.update(id, patch);
  },
  deleteQuestion(id: string) {
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
    setState(() => ({ ...defaultState, activity: [{ id: uid(), text: "Data demo di-reset", at: Date.now() }] }));
  },
};

function pick(p: Partial<Settings>): Partial<OverlayState> {
  const out: Partial<OverlayState> = {};
  if (p.accent) out.accent = p.accent;
  if (p.textScale) out.textScale = p.textScale;
  if (p.sound !== undefined) out.sound = p.sound;
  if (p.showTitle !== undefined) out.showTitle = p.showTitle;
  if (p.showBadge !== undefined) out.showBadge = p.showBadge;
  return out;
}

export function normalize(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

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
  visible: true, payload: null, updatedAt: 0, payloadAt: 0, accent: state.settings.accent, textScale: state.settings.textScale,
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
  pushOverlay({ ...o, payload, visible: true, payloadAt: Date.now(), votes: undefined });
  const g = GIMMICKS.find((x) => x.id === payload.gimmick);
  actions.log(`Overlay: ${g?.name ?? payload.gimmick} dikirim`);
}
export function setOverlayVisible(visible: boolean) {
  pushOverlay({ ...readOverlay(), visible });
  actions.log(visible ? "Overlay ditampilkan" : "Overlay disembunyikan");
}
export function showBanner(text: string) {
  pushOverlay({ ...readOverlay(), banner: { text, at: Date.now() } });
}
export function setOverlayVotes(votes: { a: number; b: number }) {
  pushOverlay({ ...readOverlay(), votes });
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

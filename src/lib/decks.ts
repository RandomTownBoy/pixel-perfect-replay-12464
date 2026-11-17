import { VIEWER_CATEGORY, type Question } from "@/lib/kyoka";

/**
 * Deck Pick a Card = satu set tetap, maksimal DECK_SIZE kartu (jumlah kartu yang tampil di overlay).
 * Tanpa migrasi database: nama deck disimpan di kolom `category` pada baris questions (gimmick = "card").
 */
export const DECK_SIZE = 6;
export const VIEWER_DECK_PREFIX = "Penonton #";

export const viewerDeckName = (n: number) => `${VIEWER_DECK_PREFIX}${n}`;
export function viewerDeckNumber(name: string): number | null {
  const m = /^Penonton #(\d+)$/.exec(name.trim());
  return m ? Number(m[1]) : null;
}
export const isViewerDeck = (name: string) => viewerDeckNumber(name) !== null;

export type DeckStatus = "new" | "partial" | "done";
export type Deck = {
  name: string; viewer: boolean; cards: Question[];
  /** Jumlah kartu yang sudah dibuka (ditandai terpakai). */
  used: number; total: number; status: DeckStatus;
  /** Deck penonton terkunci = penuh, sudah tayang di overlay, atau sudah ada kartu yang dibuka. Kartu baru tidak masuk ke deck terkunci. */
  locked: boolean;
};

const byAge = (a: Question, b: Question) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function deckStatusOf(cards: Question[]): DeckStatus {
  const used = cards.filter((c) => c.used).length;
  if (!cards.length || used === 0) return "new";
  return used >= cards.length ? "done" : "partial";
}

/** Urutan kartu di dalam deck: pakai urutan tersimpan (hasil "Kocok urutan"); kartu yang belum tercatat ikut di belakang menurut umur. */
export function orderCards(cards: Question[], order: string[] | undefined): Question[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i]));
  return [...cards].sort((a, b) => {
    const ra = rank.get(a.id); const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return byAge(a, b);
  });
}

export function buildDecks(qs: Question[], order: Record<string, string[]> = {}, locked: ReadonlySet<string> = new Set()): Deck[] {
  const groups = new Map<string, Question[]>();
  for (const q of qs) {
    if (q.gimmick !== "card") continue;
    const g = groups.get(q.category);
    if (g) g.push(q); else groups.set(q.category, [q]);
  }
  const decks: Deck[] = [];
  for (const [name, list] of groups) {
    const cards = orderCards(list, order[name]);
    const used = cards.filter((c) => c.used).length;
    const viewer = isViewerDeck(name);
    decks.push({
      name, viewer, cards, used, total: cards.length, status: deckStatusOf(cards),
      locked: viewer && (locked.has(name) || cards.length >= DECK_SIZE || used > 0),
    });
  }
  const firstAt = (d: Deck) => Math.min(...d.cards.map((c) => c.createdAt));
  return decks.sort((a, b) => {
    if (a.viewer !== b.viewer) return a.viewer ? 1 : -1;
    if (a.viewer && b.viewer) return (viewerDeckNumber(a.name) ?? 0) - (viewerDeckNumber(b.name) ?? 0);
    return firstAt(a) - firstAt(b) || natural(a.name, b.name);
  });
}

/** Deck berikutnya (setelah `name`) yang belum selesai; memutar ke awal kalau perlu. */
export function nextPlayableDeck(decks: Deck[], name: string): Deck | undefined {
  const i = decks.findIndex((d) => d.name === name);
  const rest = [...decks.slice(i + 1), ...decks.slice(0, Math.max(0, i))];
  return rest.find((d) => d.status !== "done" && d.total > 0);
}

/**
 * Deck penonton tujuan untuk kartu baru: deck penonton bernomor terkecil yang belum terkunci
 * (belum penuh, belum tayang, belum ada kartu terbuka). Kalau tidak ada, deck berikutnya dibuat.
 * `extra` = jumlah kartu yang sudah dijatah ke deck tertentu tapi belum terlihat di `qs` (dipakai perencana migrasi).
 */
export function pickViewerDeck(qs: Question[], locked: ReadonlySet<string> = new Set(), extra: ReadonlyMap<string, number> = new Map()): string {
  const info = new Map<string, { total: number; locked: boolean }>();
  for (const d of buildDecks(qs, {}, locked)) if (d.viewer) info.set(d.name, { total: d.total, locked: d.locked });
  for (const [name, add] of extra) {
    if (!isViewerDeck(name)) continue;
    const cur = info.get(name) ?? { total: 0, locked: false };
    info.set(name, { total: cur.total + add, locked: cur.locked });
  }
  const names = [...info.keys()].sort((a, b) => (viewerDeckNumber(a) ?? 0) - (viewerDeckNumber(b) ?? 0));
  for (const name of names) {
    const d = info.get(name)!;
    if (!d.locked && d.total < DECK_SIZE) return name;
  }
  const max = Math.max(0, ...names.map((k) => viewerDeckNumber(k) ?? 0));
  return viewerDeckName(max + 1);
}

/** Nama deck yang belum dipakai: "Deck baru", "Deck baru 2", ... */
export function freeDeckName(qs: Question[], base = "Deck baru"): string {
  const taken = new Set(qs.filter((q) => q.gimmick === "card").map((q) => q.category.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

export type DeckMove = { id: string; category: string };

/**
 * Rencana perapian deck dari data lama (tanpa migrasi database, hanya mengubah kolom kategori):
 * 1. Pack lama berisi > 6 kartu dipecah per 6 ("Weird Questions" → "Weird Questions 1", "Weird Questions 2").
 *    Kalau namanya sudah bernomor, 6 kartu tertua tetap dan sisanya pindah ke nomor berikutnya.
 * 2. Kartu penonton lama di pack "Dari Penonton" menjadi deck "Penonton #n".
 * 3. Deck penonton yang kelebihan (mis. dua kiriman masuk bersamaan) memindahkan kartu terbarunya ke deck penonton berikutnya.
 * Hasilnya idempoten: setelah diterapkan, rencana berikutnya kosong.
 */
export function planDeckMoves(qs: Question[], locked: ReadonlySet<string> = new Set()): DeckMove[] {
  const cards = qs.filter((q) => q.gimmick === "card");
  const moves: DeckMove[] = [];
  const taken = new Set(cards.map((q) => q.category));
  const claim = (name: string) => { taken.add(name); return name; };
  const freeNumbered = (base: string, from: number) => { let n = from; while (taken.has(`${base} ${n}`)) n++; return claim(`${base} ${n}`); };

  const byCat = new Map<string, Question[]>();
  for (const q of cards) { const g = byCat.get(q.category); if (g) g.push(q); else byCat.set(q.category, [q]); }

  // Kartu penonton yang perlu rumah baru, dari pack lama maupun kelebihan deck penonton.
  const viewerPool: Question[] = [...(byCat.get(VIEWER_CATEGORY) ?? [])];
  // Simulasi isi tiap deck penonton supaya penjatahan tidak melebihi 6.
  const virtual: Question[] = [];
  const extra = new Map<string, number>();

  for (const [name, list] of byCat) {
    const sorted = [...list].sort(byAge);
    if (name === VIEWER_CATEGORY) continue;
    if (isViewerDeck(name)) {
      if (sorted.length > DECK_SIZE) viewerPool.push(...sorted.slice(DECK_SIZE));
      continue;
    }
    if (sorted.length <= DECK_SIZE) continue;
    const numbered = /^(.*\S)\s+(\d+)$/.exec(name);
    if (numbered) {
      const base = numbered[1]!;
      for (let i = DECK_SIZE; i < sorted.length; i += DECK_SIZE) {
        const target = freeNumbered(base, Number(numbered[2]) + 1);
        for (const q of sorted.slice(i, i + DECK_SIZE)) moves.push({ id: q.id, category: target });
      }
    } else {
      for (let i = 0, n = 1; i < sorted.length; i += DECK_SIZE, n++) {
        const target = freeNumbered(name, n);
        for (const q of sorted.slice(i, i + DECK_SIZE)) moves.push({ id: q.id, category: target });
      }
      // nama asli tidak dipakai lagi
      taken.delete(name);
    }
  }

  // Penjatahan kartu penonton: deck penonton yang masih lapang dan belum terkunci dulu, lalu deck baru.
  const staying = qs.filter((q) => !viewerPool.some((p) => p.id === q.id));
  virtual.push(...staying);
  for (const q of [...viewerPool].sort(byAge)) {
    const target = pickViewerDeck(virtual, locked, extra);
    if (target !== q.category) moves.push({ id: q.id, category: target });
    extra.set(target, (extra.get(target) ?? 0) + 1);
  }
  return moves;
}

/* ---------- Penyimpanan di browser: urutan kartu, deck terkunci, deck terpilih ---------- */

const ORDER_KEY = "kyoka.card.order.v2";
const LOCK_KEY = "kyoka.card.locked.v2";
const DECK_KEY = "kyoka.card.deck.v2";

function read<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ }
}

export const loadOrder = (): Record<string, string[]> => {
  const v = read<unknown>(ORDER_KEY, {});
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === "string");
  return out;
};
export const saveOrder = (name: string, ids: string[]) => write(ORDER_KEY, { ...loadOrder(), [name]: ids });
export const forgetOrder = (name: string) => { const o = loadOrder(); delete o[name]; write(ORDER_KEY, o); };

export const getLockedDecks = (): Set<string> => {
  const v = read<unknown>(LOCK_KEY, []);
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
};
export const lockDeck = (name: string) => { if (!isViewerDeck(name)) return; const s = getLockedDecks(); if (!s.has(name)) { s.add(name); write(LOCK_KEY, [...s]); } };
export const forgetLock = (name: string) => { const s = getLockedDecks(); if (s.delete(name)) write(LOCK_KEY, [...s]); };

export const loadSelectedDeck = (): string | null => read<string | null>(DECK_KEY, null);
export const saveSelectedDeck = (name: string | null) => write(DECK_KEY, name);

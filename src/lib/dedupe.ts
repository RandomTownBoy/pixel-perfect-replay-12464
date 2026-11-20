/**
 * Deteksi duplikat dan spam kiriman penonton (fungsi murni, tanpa Supabase).
 * Duplikat dihitung lintas gimmick: isi yang sama dikirim ke dua gimmick berbeda tetap dianggap duplikat.
 */
export type DupeItem = { id: string; kind: string; content: string | null; created_at: string; fingerprint?: string | null | undefined };

export const SPAM_MAX = 3;
export const SPAM_WINDOW_MS = 60_000;

export function normText(t: string | null | undefined): string {
  return (t ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function levenshteinWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j]! < rowMin) rowMin = cur[j]!;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** Dua teks dianggap sama/mirip: identik, kata sama beda urutan ("A | B" vs "B | A"), tumpang tindih kata ≥ 80%, atau beda typo kecil. */
export function similar(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normText(a); const nb = normText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(na.split(" ")); const tb = new Set(nb.split(" "));
  if (ta.size === tb.size && [...ta].every((x) => tb.has(x))) return true;
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const union = ta.size + tb.size - inter;
  if (Math.min(ta.size, tb.size) >= 3 && inter / union >= 0.8) return true;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen >= 8 && maxLen <= 300 && levenshteinWithin(na, nb, Math.floor(maxLen * 0.12));
}

/** `other` lebih dulu dari `item`: dipakai agar hanya kiriman yang datang belakangan yang ditandai (dua kiriman kembar tidak saling menandai). */
const olderThan = (other: DupeItem, item: DupeItem) => {
  const a = Date.parse(other.created_at); const b = Date.parse(item.created_at);
  return a < b || (a === b && other.id < item.id);
};

/** Kiriman lebih lama yang sama/mirip dengan `item` (jenis apa pun, kecuali vote), atau undefined. */
export function findDuplicate(item: DupeItem, others: readonly (DupeItem | null | undefined)[]): DupeItem | undefined {
  if (!normText(item.content)) return undefined;
  return others.find((o): o is DupeItem => !!o && o.id !== item.id && o.kind !== "vote" && olderThan(o, item) && similar(item.content, o.content));
}

/** Pengirim yang sama (fingerprint) sudah mengirim ≥ SPAM_MAX kiriman dalam SPAM_WINDOW_MS sebelum `item`. */
export function isSpam(item: DupeItem, others: readonly (DupeItem | null | undefined)[], max = SPAM_MAX, windowMs = SPAM_WINDOW_MS): boolean {
  if (!item.fingerprint) return false;
  const at = Date.parse(item.created_at);
  const seen = new Set<string>();
  for (const o of others) {
    if (!o || o.id === item.id || o.kind === "vote" || o.fingerprint !== item.fingerprint || !olderThan(o, item)) continue;
    if (at - Date.parse(o.created_at) <= windowMs) seen.add(o.id);
  }
  return seen.size >= max;
}

/** Alasan singkat untuk label di tab Cek, atau null kalau kiriman aman. */
export function suspectReason(item: DupeItem, others: readonly (DupeItem | null | undefined)[]): string | null {
  const dup = findDuplicate(item, others);
  if (dup) {
    const snip = (dup.content ?? "").trim().replace(/\s+/g, " ");
    return `duplikat/mirip (${dup.kind}): “${snip.length > 36 ? `${snip.slice(0, 36)}…` : snip}”`;
  }
  if (isSpam(item, others)) return "spam: terlalu sering mengirim";
  return null;
}

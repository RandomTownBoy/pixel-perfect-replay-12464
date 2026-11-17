/** Batas angka yang dipakai bersama oleh UI, penyimpanan pengaturan, dan server. Satu sumber supaya tidak saling bertentangan. */
export const LIMITS = {
  /** Jumlah irisan/kapasitas roda Spin. */
  spin: { min: 1, max: 300 },
  /** Jumlah item AI per permintaan (server membatasi sama persis). */
  aiCount: { min: 1, max: 15 },
  /** Countdown This or That yang dikirim manual (detik). */
  countdown: { min: 3, max: 60 },
  /** Batas bawah durasi tayang antrean per gimmick (detik). Batas atasnya = QUEUE_SECONDS di kyoka.ts. */
  queueMinSeconds: 10,
  overlaySize: { min: 240, max: 7680 },
  giftWeight: { min: 1, max: 9999 },
  vipDiamonds: { min: 1, max: 10_000_000 },
  textScale: { min: 0.7, max: 1.6 },
} as const;

/** Bulatkan dan jepit ke [min, max]. Nilai bukan angka → fallback. */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.round(n)));
}

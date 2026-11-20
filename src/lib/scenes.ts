/**
 * Scene idle overlay: lima adegan animasi yang bergantian di tepi kartu (seperti animasi idle skin hero MOBA).
 * Urutan diacak tiap "ronde" (satu putaran penuh kelima scene, tanpa pengulangan), dan scene terakhir sebuah ronde
 * tidak akan jadi scene pertama ronde berikutnya, jadi tidak pernah muncul dua kali berturut-turut.
 */
export const SCENES = ["showtime", "comet", "neko", "sakura", "beat"] as const;
export type Scene = (typeof SCENES)[number];
export type SceneMode = Scene | "random";
export const SCENE_MODES: readonly SceneMode[] = ["random", ...SCENES];

/** Lama tiap scene tayang (ms). Koreografi tiap scene dirancang pas 12 detik. */
export const SCENE_MS = 12000;
/** Lama scene lama memudar saat scene baru masuk (ms). */
export const SCENE_FADE_MS = 900;

/** Nilai pengaturan lama / tak dikenal (mis. "meteor") dianggap acak. */
export function resolveSceneMode(v: unknown): SceneMode {
  return (SCENE_MODES as readonly unknown[]).includes(v) ? (v as SceneMode) : "random";
}

/** Fisher-Yates; `rnd` bisa diganti untuk uji. */
export function shuffle<T>(list: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Satu ronde baru: semua scene sekali, urutan acak, dan tidak diawali `last` (scene terakhir ronde sebelumnya). */
export function nextRound(last?: Scene, rnd: () => number = Math.random): Scene[] {
  const bag = shuffle(SCENES, rnd);
  if (last && bag[0] === last) {
    const k = 1 + Math.floor(rnd() * (bag.length - 1));
    [bag[0], bag[k]] = [bag[k]!, bag[0]!];
  }
  return bag;
}

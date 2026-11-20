import { describe, expect, it } from "vitest";
import { SCENES, nextRound, resolveSceneMode, shuffle } from "@/lib/scenes";

/** RNG deterministik (mulberry32) supaya uji tidak flaky. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("scene idle overlay", () => {
  it("shuffle mempertahankan semua elemen", () => {
    expect([...shuffle(SCENES, seeded(1))].sort()).toEqual([...SCENES].sort());
  });
  it("satu ronde memuat kelima scene tepat sekali", () => {
    for (let s = 1; s <= 50; s++) expect([...nextRound(undefined, seeded(s))].sort()).toEqual([...SCENES].sort());
  });
  it("scene terakhir ronde sebelumnya tidak jadi pembuka ronde berikutnya (tidak ada pengulangan berturut-turut)", () => {
    const rnd = seeded(7);
    let last: (typeof SCENES)[number] | undefined;
    for (let r = 0; r < 300; r++) {
      const bag = nextRound(last, rnd);
      expect(bag).toHaveLength(5);
      if (last) expect(bag[0]).not.toBe(last);
      last = bag[4];
    }
  });
  it("urutan benar-benar bervariasi antar ronde", () => {
    const rnd = seeded(3);
    const seen = new Set<string>();
    let last: (typeof SCENES)[number] | undefined;
    for (let r = 0; r < 40; r++) { const bag = nextRound(last, rnd); seen.add(bag.join(",")); last = bag[4]; }
    expect(seen.size).toBeGreaterThan(10);
  });
  it("pengaturan lama atau rusak jatuh ke acak", () => {
    for (const v of ["spotlight", "meteor", "aurora", "orbit", "prism", "", undefined, 3]) expect(resolveSceneMode(v)).toBe("random");
    for (const v of ["random", ...SCENES]) expect(resolveSceneMode(v)).toBe(v);
  });
});

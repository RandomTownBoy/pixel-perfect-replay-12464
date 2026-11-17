import { describe, expect, it } from "vitest";
import { clampInt, LIMITS } from "@/lib/limits";
import { actions, normalizeSettings, getSettings, queueSecondsFor, QUEUE_SECONDS } from "@/lib/kyoka";

describe("clampInt", () => {
  it("rounds, clamps and falls back", () => {
    expect(clampInt("12", 1, 10, 5)).toBe(10);
    expect(clampInt(-4, 1, 10, 5)).toBe(1);
    expect(clampInt(3.6, 1, 10, 5)).toBe(4);
    expect(clampInt("", 1, 10, 5)).toBe(5);
    expect(clampInt(NaN, 1, 10, 5)).toBe(5);
    expect(clampInt(undefined, 3, 10, 1)).toBe(3);
  });
});

describe("normalizeSettings", () => {
  const base = () => ({ ...getSettings() });
  it("keeps the same object when nothing needs fixing", () => {
    const s = base();
    expect(normalizeSettings(s)).toBe(s);
  });
  it("never lets wheel slices exceed capacity or go below 1", () => {
    expect(normalizeSettings({ ...base(), spinCapacity: 20, spinSlices: 50 }).spinSlices).toBe(20);
    expect(normalizeSettings({ ...base(), spinCapacity: 5, spinSlices: -3 }).spinSlices).toBe(1);
    expect(normalizeSettings({ ...base(), spinCapacity: 999, spinSlices: 999 })).toMatchObject({ spinCapacity: 300, spinSlices: 300 });
    expect(normalizeSettings({ ...base(), spinCapacity: -1 }).spinCapacity).toBe(1);
  });
  it("lowering capacity pulls slices down with it (through the store)", () => {
    actions.updateSettings({ spinCapacity: 30, spinSlices: 10 });
    actions.updateSettings({ spinCapacity: 4 });
    expect(getSettings()).toMatchObject({ spinCapacity: 4, spinSlices: 4 });
    actions.updateSettings({ spinCapacity: 30, spinSlices: 10 });
  });
  it("keeps VIP tiers strictly ascending and positive", () => {
    expect(normalizeSettings({ ...base(), vipTiers: [500, 100, 1000] }).vipTiers).toEqual([500, 501, 1000]);
    expect(normalizeSettings({ ...base(), vipTiers: [0, 0, 0] }).vipTiers).toEqual([1, 100, 1000]);
  });
  it("bounds countdown, overlay size and gift weights", () => {
    const n = normalizeSettings({ ...base(), countdown: 0, overlayWidth: 5, overlayHeight: 99999, giftRules: [{ id: "x", name: "x", emoji: "x", effect: "vote", weight: 0, reward: "" }] });
    expect(n.countdown).toBe(LIMITS.countdown.min);
    expect(n.overlayWidth).toBe(LIMITS.overlaySize.min);
    expect(n.overlayHeight).toBe(LIMITS.overlaySize.max);
    expect(n.giftRules[0]!.weight).toBe(1);
  });
});

describe("queue durations are configurable but capped at the original maximum", () => {
  it("defaults to the maximum", () => {
    for (const [k, v] of Object.entries(QUEUE_SECONDS)) expect(queueSecondsFor(k)).toBe(v);
  });
  it("accepts shorter values, never longer or below the minimum", () => {
    actions.updateSettings({ queueDurations: { ...QUEUE_SECONDS, confession: 60, hottake: 9999, chaos: 1 } });
    expect(queueSecondsFor("confession")).toBe(60);
    expect(queueSecondsFor("hottake")).toBe(QUEUE_SECONDS.hottake);
    expect(queueSecondsFor("chaos")).toBe(LIMITS.queueMinSeconds);
    actions.updateSettings({ queueDurations: { ...QUEUE_SECONDS } });
  });
});

import { describe, expect, it } from "vitest";
import { BANKABLE_KINDS, KIND_TO_GIMMICK, QUEUE_KINDS } from "@/lib/cloud";
import { DEFAULT_INTAKE } from "@/lib/kyoka";

describe("Audience cards", () => {
  it("accepts card input by default", () => {
    expect(DEFAULT_INTAKE.card).toBe(true);
  });
  it("saves audience card content as Pick a Card", () => {
    expect(BANKABLE_KINDS.has("card")).toBe(true);
    expect(KIND_TO_GIMMICK["card"]).toBe("card");
  });
  it("keeps card content out of the automatic reveal queue", () => {
    expect(QUEUE_KINDS.has("card")).toBe(false);
  });
});

describe("Audience history per gimmick", () => {
  it("maps every gimmick to the submission kinds shown in its history", async () => {
    const { GIMMICK_KINDS } = await import("@/lib/cloud");
    const { GIMMICKS } = await import("@/lib/kyoka");
    for (const g of GIMMICKS) expect(GIMMICK_KINDS[g.id].length).toBeGreaterThan(0);
    expect(GIMMICK_KINDS.card).toEqual(["card"]);
    expect(GIMMICK_KINDS.confession).toEqual(["confession"]);
  });
  it("formats relative time", async () => {
    const { timeAgo } = await import("@/components/AudienceHistory");
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(timeAgo("2026-01-01T11:59:50Z", now)).toBe("baru saja");
    expect(timeAgo("2026-01-01T11:30:00Z", now)).toBe("30 mnt lalu");
    expect(timeAgo("2025-12-31T09:00:00Z", now)).toBe("1 hari lalu");
  });
});

describe("Auto-routing & queue durations", () => {
  it("queues only gimmicks that play on screen; cards and spin never use the queue", async () => {
    const { QUEUE_KINDS } = await import("@/lib/cloud");
    expect([...QUEUE_KINDS].sort()).toEqual(["chaos", "confession", "hottake", "thisorthat"]);
    expect(QUEUE_KINDS.has("spin")).toBe(false);
    expect(QUEUE_KINDS.has("card")).toBe(false);
  });
  it("uses the agreed per-gimmick display time", async () => {
    const { queueSecondsFor } = await import("@/lib/kyoka");
    expect(queueSecondsFor("confession")).toBe(180);
    expect(queueSecondsFor("hottake")).toBe(120);
    expect(queueSecondsFor("chaos")).toBe(120);
    expect(queueSecondsFor("thisorthat")).toBe(90);
  });
});

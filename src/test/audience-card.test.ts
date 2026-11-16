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
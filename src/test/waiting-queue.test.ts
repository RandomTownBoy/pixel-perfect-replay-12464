import { describe, expect, it } from "vitest";
import { waitingOf, waitingOrder, type Submission } from "@/lib/cloud";

const sub = (id: string, kind: string, at: string, extra: Partial<Submission> = {}): Submission => ({
  id, kind, round_id: null, choice: null, content: `isi ${id}`, nickname: null, status: "pending", created_at: at, ...extra,
});

describe("Daftar tunggu per gimmick", () => {
  const inbox = [
    sub("c1", "confession", "2026-01-01T10:00:00Z"),
    sub("c2", "confession", "2026-01-01T10:05:00Z"),
    sub("c3", "confession", "2026-01-01T10:10:00Z", { flagged: true }),
    sub("h1", "hottake", "2026-01-01T10:01:00Z"),
    sub("c4", "confession", "2026-01-01T10:02:00Z", { status: "review" }),
  ];

  it("hanya memuat kiriman bersih berstatus pending dari jenis yang diminta", () => {
    const ids = waitingOf({ inbox, queue: [], nowShowing: null }, "confession").map((s) => s.id);
    expect(ids.sort()).toEqual(["c1", "c2"]);
  });

  it("tidak memuat yang sudah antre atau sedang tayang", () => {
    const ids = waitingOf({ inbox, queue: [inbox[1]!], nowShowing: inbox[0]! }, "confession");
    expect(ids).toEqual([]);
  });

  it("memutar yang paling lama menunggu lebih dulu", () => {
    const list = waitingOf({ inbox, queue: [], nowShowing: null }, "confession");
    expect(waitingOrder(list).map((s) => s.id)).toEqual(["c1", "c2"]);
  });
});

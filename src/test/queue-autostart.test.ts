import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------- supabase tiruan: tabel in-memory + channel yang bisa dipicu dari tes ---------- */
type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  handlers: [] as { event: string; table: string; cb: (e: { new: Row }) => void }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    let eqId: string | null = null;
    const run = () => {
      const rows = db.tables[table] ?? [];
      if (op === "update") {
        const hit = rows.filter((r) => eqId === null || r.id === eqId);
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Record<string, unknown>) => { op = "update"; patch = p; return q; },
      insert: () => { op = "insert"; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (col: string, v: string) => { if (col === "id") eqId = v; return q; },
      in: () => q, not: () => q, gte: () => q, order: () => q, limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return q;
  };
  const channel = () => {
    const ch: Record<string, unknown> = {
      on: (_t: string, cfg: { event: string; table: string }, cb: (e: { new: Row }) => void) => { db.handlers.push({ event: cfg.event, table: cfg.table, cb }); return ch; },
      subscribe: () => ch, send: () => undefined, presenceState: () => ({}),
    };
    return ch;
  };
  return {
    supabase: {
      from: (t: string) => query(t), channel, removeChannel: vi.fn(),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
    },
  };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/ticker", () => ({
  startTimer: (cb: () => void, ms: number, repeat = false) => ({ id: 0, native: (repeat ? setInterval : setTimeout)(cb, ms) }),
  stopTimer: (h: { native?: ReturnType<typeof setTimeout> } | null) => { if (h?.native) { clearTimeout(h.native); clearInterval(h.native); } },
}));

import { liveActions, onAirGimmick, QUEUE_KINDS, useCloudSync, useLive, waitingOf, type Submission } from "@/lib/cloud";
import { actions, getSettings, readOverlay, sendToOverlay } from "@/lib/kyoka";

const sub = (id: string, kind: string, at: string, content = `isi ${id}`): Submission => ({
  id, kind, round_id: null, choice: null, content, nickname: null, status: "pending", created_at: at,
});
const ARMED_KEY = "kyoka.queue.armed.v1";

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };
const insertEvent = (r: Submission) => db.handlers.find((h) => h.event === "INSERT" && h.table === "audience_submissions")!.cb({ new: r as unknown as Row });
const updateEvent = (r: Submission) => db.handlers.find((h) => h.event === "UPDATE" && h.table === "audience_submissions")!.cb({ new: r as unknown as Row });

async function mount(pending: Submission[] = []) {
  db.tables = { audience_submissions: pending.map((p) => ({ ...p })), questions: [], live_events: [], studio_sessions: [] };
  db.handlers = [];
  const hook = renderHook(() => ({ live: useLive((l) => l), cloud: useCloudSync("u1") }));
  await flush();
  return hook;
}
const snap = () => renderHook(() => useLive((l) => ({ now: l.nowShowing, queue: l.queue, inbox: l.inbox }))).result.current;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  actions.updateSettings({ autoSwitchQueue: true });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("Random Chaos di antrean menunggu", () => {
  it("QUEUE_KINDS memuat chaos dan problem, dan waitingOf mengelompokkannya", () => {
    expect(QUEUE_KINDS.has("chaos")).toBe(true);
    const inbox = [sub("k1", "chaos", "2026-01-01T10:00:00Z", "a, b, c"), sub("p1", "problem", "2026-01-01T10:01:00Z")];
    expect(waitingOf({ inbox, queue: [], nowShowing: null }, "chaos").map((s) => s.id)).toEqual(["k1", "p1"]);
  });
  it("chaos masuk Question Bank sebagai gimmick chaos", async () => {
    const { BANKABLE_KINDS, KIND_TO_GIMMICK } = await import("@/lib/cloud");
    expect(BANKABLE_KINDS.has("chaos")).toBe(true);
    expect(KIND_TO_GIMMICK["chaos"]).toBe("chaos");
  });
});

describe("Antrean lanjut otomatis", () => {
  it("kiriman baru memulai sesi saat overlay idle (tanpa sesi armed)", async () => {
    const { unmount } = await mount();
    await act(async () => { insertEvent(sub("c1", "confession", "2026-01-01T10:00:00Z")); });
    await flush();
    expect(snap().now?.id).toBe("c1");
    expect(localStorage.getItem(ARMED_KEY)).toBe("confession");
    unmount();
  });

  it("tidak menimpa konten manual host, walau jenisnya jenis antrean", async () => {
    sendToOverlay({ gimmick: "hottake", topic: "manual host" });
    const { unmount } = await mount();
    await act(async () => { insertEvent(sub("t1", "thisorthat", "2026-01-01T10:00:00Z", "A | B")); });
    await flush();
    expect(snap().now).toBeNull();
    unmount();
  });

  it("sesi armed tidak dipulihkan kalau layar sudah diganti host saat halaman tertutup", async () => {
    sendToOverlay({ gimmick: "hottake", topic: "manual host" });
    localStorage.setItem(ARMED_KEY, "hottake");
    localStorage.setItem("kyoka.queue.shownAt.v1", "123");
    const { unmount } = await mount();
    expect(localStorage.getItem(ARMED_KEY)).toBeNull();
    unmount();
  });

  it("tidak mengambil alih Spin", async () => {
    sendToOverlay({ gimmick: "spin", phase: "standby" } as never);
    const { unmount } = await mount();
    await act(async () => { insertEvent(sub("c1", "confession", "2026-01-01T10:00:00Z")); });
    await flush();
    expect(snap().now).toBeNull();
    expect(onAirGimmick()).toBe("spin");
    unmount();
  });

  it("serah-terima ke jenis lain saat antrean habis (pengaturan hidup)", async () => {
    const { unmount } = await mount([sub("h1", "hottake", "2026-01-01T09:00:00Z")]);
    await act(async () => { insertEvent(sub("c1", "confession", "2026-01-01T10:00:00Z")); });
    await flush();
    expect(snap().now?.id).toBe("c1");
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(snap().now?.id).toBe("h1");
    unmount();
  });

  it("tidak serah-terima saat pengaturan mati: sesi tetap armed dan kiriman lain menunggu", async () => {
    actions.updateSettings({ autoSwitchQueue: false });
    const { unmount } = await mount([sub("h1", "hottake", "2026-01-01T09:00:00Z")]);
    await act(async () => { insertEvent(sub("c1", "confession", "2026-01-01T10:00:00Z")); });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(snap().now).toBeNull();
    expect(localStorage.getItem(ARMED_KEY)).toBe("confession");
    expect(snap().inbox.some((s) => s.id === "h1")).toBe(true);
    unmount();
  });

  it("'Kembalikan ke Inbox' memicu routing seperti kiriman baru", async () => {
    const back = { ...sub("c9", "confession", "2026-01-01T10:00:00Z"), status: "shown" };
    const { unmount } = await mount();
    // status berubah jadi pending dari tab lain: handler UPDATE realtime harus menyalurkannya
    await act(async () => { updateEvent({ ...back, status: "pending" }); });
    await flush();
    expect(snap().now?.id).toBe("c9");
    unmount();
  });

  it("armedKind dipulihkan dari localStorage saat mount dan dibersihkan saat panic", async () => {
    localStorage.setItem(ARMED_KEY, "hottake");
    localStorage.setItem("kyoka.queue.shownAt.v1", String(readOverlay().payloadAt));
    const { unmount } = await mount();
    await act(async () => { insertEvent(sub("h1", "hottake", "2026-01-01T10:00:00Z")); });
    await flush();
    expect(snap().now?.id).toBe("h1");
    act(() => liveActions.panic());
    expect(localStorage.getItem(ARMED_KEY)).toBeNull();
    expect(readOverlay().visible).toBe(false);
    unmount();
  });

  it("cleanup mereset antrean dan item yang sedang tampil", async () => {
    const { unmount } = await mount();
    await act(async () => { insertEvent(sub("c1", "confession", "2026-01-01T10:00:00Z")); });
    await flush();
    expect(snap().now?.id).toBe("c1");
    unmount();
    expect(snap().now).toBeNull();
    expect(snap().queue).toEqual([]);
  });

  it("pengaturan autoSwitchQueue bawaan hidup", () => {
    expect(getSettings().autoSwitchQueue).toBe(true);
  });
});

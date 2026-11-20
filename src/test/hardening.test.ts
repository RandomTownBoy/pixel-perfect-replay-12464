import { describe, expect, it } from "vitest";
import { actions, getCategories, getSettings, getQuestions } from "@/lib/kyoka";
import { takeAiToken } from "@/lib/ai.functions";

describe("Rate limit AI", () => {
  it("membatasi 20 permintaan per 10 menit per pengguna, lalu pulih bertahap", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(takeAiToken("u-rate", t0)).toBe(true);
    expect(takeAiToken("u-rate", t0)).toBe(false);
    expect(takeAiToken("u-lain", t0)).toBe(true);
    expect(takeAiToken("u-rate", t0 + 31_000)).toBe(true); // ~1 token pulih tiap 30 detik
  });
});

describe("resetDemo", () => {
  it("tidak menyentuh pengaturan dan kategori, dan mempertahankan konten buatan sendiri", () => {
    actions.updateSettings({ creatorName: "Tes Reset" });
    actions.addCategory("Kategori Tes");
    actions.addQuestions([{ text: "buatan sendiri tes reset", gimmick: "spin", category: "Kategori Tes" }]);
    const settings = getSettings();
    const cats = getCategories();
    actions.resetDemo();
    expect(getSettings()).toBe(settings);
    expect(getCategories()).toBe(cats);
    expect(getQuestions().some((q) => q.text === "buatan sendiri tes reset")).toBe(true);
  });
});

describe("Kategori vs deck Pick a Card", () => {
  it("deck 'Penonton #N' tidak masuk daftar kategori dan sisa lamanya dibersihkan", async () => {
    const { replaceQuestions, replaceCategories } = await import("@/lib/kyoka");
    replaceCategories(["Penonton #1", "Penonton #7", "Kategori Aman"]);
    const q = (id: string, gimmick: "card" | "spin", category: string) => ({ id, text: id, gimmick, category, favorite: false, used: false, createdAt: 1 });
    replaceQuestions([q("a", "card", "Penonton #2"), q("b", "spin", "Kategori Aman")]);
    const cats = getCategories();
    expect(cats.some((c) => /^Penonton #\d+$/.test(c))).toBe(false);
    expect(cats).toContain("Kategori Aman");
  });
});

describe("Overlay real time: kartu dan roda", () => {
  const q = (id: string, gimmick: "card" | "spin", category: string, createdAt = 1) => ({ id, text: id, gimmick, category, favorite: false, used: false, createdAt });
  it("kartu baru di deck yang tayang menaikkan jumlah kartu di overlay + penanda animasi", async () => {
    const { replaceQuestions, sendToOverlay, readOverlay } = await import("@/lib/kyoka");
    sendToOverlay({ gimmick: "card", phase: "standby", deck: "Penonton #9", count: 2, opened: [] });
    replaceQuestions([q("c1", "card", "Penonton #9"), q("c2", "card", "Penonton #9"), q("c3", "card", "Penonton #9")]);
    const p = readOverlay().payload;
    expect(p).toMatchObject({ gimmick: "card", count: 3, added: 1 });
    expect((p as { addedAt?: number }).addedAt).toBeGreaterThan(0);
  });
  it("jumlah kartu dijepit maksimal 6", async () => {
    const { replaceQuestions, sendToOverlay, readOverlay } = await import("@/lib/kyoka");
    sendToOverlay({ gimmick: "card", phase: "dealt", deck: "Penonton #8", count: 5, opened: [] });
    replaceQuestions(Array.from({ length: 8 }, (_, i) => q(`k${i}`, "card", "Penonton #8")));
    expect(readOverlay().payload).toMatchObject({ count: 6, added: 1 });
  });
  it("saat roda menampilkan hasil, pertanyaan baru dihitung 'menunggu' dan roda tidak diubah", async () => {
    const { replaceQuestions, sendToOverlay, readOverlay, VIEWER_CATEGORY } = await import("@/lib/kyoka");
    sendToOverlay({ gimmick: "spin", phase: "result", category: VIEWER_CATEGORY, items: ["lama"], winnerIndex: 0, question: "lama" });
    replaceQuestions([q("lama", "spin", VIEWER_CATEGORY, 1), q("baru", "spin", VIEWER_CATEGORY, 2)]);
    const p = readOverlay().payload as { items?: string[]; queued?: number };
    expect(p.items).toEqual(["lama"]);
    expect(p.queued).toBe(1);
  });
});

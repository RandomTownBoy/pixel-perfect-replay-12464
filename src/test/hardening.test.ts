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

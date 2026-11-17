import { describe, expect, it } from "vitest";
import {
  buildDecks, DECK_SIZE, freeDeckName, nextPlayableDeck, orderCards, pickViewerDeck, planDeckMoves, viewerDeckName, viewerDeckNumber,
} from "@/lib/decks";
import type { Question } from "@/lib/kyoka";

let n = 0;
const card = (category: string, extra: Partial<Question> = {}): Question => ({
  id: `id-${String(++n).padStart(4, "0")}`, text: `kartu ${n}`, gimmick: "card", category, createdAt: 1000 + n, favorite: false, used: false, ...extra,
});
const many = (category: string, count: number, extra: Partial<Question> = {}) => Array.from({ length: count }, () => card(category, extra));
const apply = (qs: Question[], moves: { id: string; category: string }[]) => qs.map((q) => { const m = moves.find((x) => x.id === q.id); return m ? { ...q, category: m.category } : q; });

describe("Deck Pick a Card", () => {
  it("groups card questions by category and ignores other gimmicks", () => {
    const qs = [...many("A", 3), ...many("B", 2), card("A", { gimmick: "spin" })];
    const decks = buildDecks(qs);
    expect(decks.map((d) => [d.name, d.total])).toEqual([["A", 3], ["B", 2]]);
  });
  it("reports new / partial / done status per deck", () => {
    const decks = buildDecks([...many("A", 2), card("B", { used: true }), card("B"), ...many("C", 2, { used: true })]);
    expect(Object.fromEntries(decks.map((d) => [d.name, d.status]))).toEqual({ A: "new", B: "partial", C: "done" });
  });
  it("keeps the shuffled order and appends unknown cards", () => {
    const [a, b, c] = many("A", 3) as [Question, Question, Question];
    expect(orderCards([a, b, c], [c.id, a.id]).map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });
  it("puts viewer decks after normal decks, numbered", () => {
    const decks = buildDecks([card("Penonton #2"), card("Penonton #1"), card("Zeta")]);
    expect(decks.map((d) => d.name)).toEqual(["Zeta", "Penonton #1", "Penonton #2"]);
    expect(viewerDeckNumber("Penonton #12")).toBe(12);
    expect(viewerDeckNumber("Penonton")).toBeNull();
  });
  it("finds the next unfinished deck and wraps around", () => {
    const decks = buildDecks([card("A", { used: true }), card("B"), card("C", { used: true })]);
    expect(nextPlayableDeck(decks, "A")?.name).toBe("B");
    expect(nextPlayableDeck(decks, "C")?.name).toBe("B");
    expect(nextPlayableDeck(buildDecks([card("A", { used: true })]), "A")).toBeUndefined();
  });
  it("names new decks without clashing", () => {
    expect(freeDeckName([card("Deck baru"), card("Deck baru 2")])).toBe("Deck baru 3");
    expect(freeDeckName([])).toBe("Deck baru");
  });
});

describe("Kartu penonton mengisi deck penonton", () => {
  it("fills Penonton #1 up to 6, then starts Penonton #2", () => {
    expect(pickViewerDeck([])).toBe("Penonton #1");
    expect(pickViewerDeck(many("Penonton #1", 5))).toBe("Penonton #1");
    expect(pickViewerDeck(many("Penonton #1", DECK_SIZE))).toBe("Penonton #2");
  });
  it("skips a deck that is on air (locked) even if it is not full", () => {
    const qs = many("Penonton #1", 3);
    expect(pickViewerDeck(qs, new Set(["Penonton #1"]))).toBe("Penonton #2");
  });
  it("skips a deck that already has an opened card", () => {
    const qs = [...many("Penonton #1", 2), card("Penonton #1", { used: true })];
    expect(pickViewerDeck(qs)).toBe("Penonton #2");
  });
  it("reuses a lower unlocked deck after a gap", () => {
    expect(pickViewerDeck([...many("Penonton #1", DECK_SIZE), ...many("Penonton #2", 2)])).toBe("Penonton #2");
    expect(viewerDeckName(3)).toBe("Penonton #3");
  });
  it("marks viewer decks as locked when full, locked or opened", () => {
    const decks = buildDecks([...many("Penonton #1", DECK_SIZE), ...many("Penonton #2", 2), ...many("Penonton #3", 2)], {}, new Set(["Penonton #3"]));
    expect(decks.map((d) => d.locked)).toEqual([true, false, true]);
  });
});

describe("Perapian data pack lama (tanpa migrasi database)", () => {
  it("splits an old pack of more than 6 into numbered decks of 6", () => {
    const qs = many("Weird Questions", 13);
    const after = apply(qs, planDeckMoves(qs));
    const decks = buildDecks(after);
    expect(decks.map((d) => [d.name, d.total])).toEqual([["Weird Questions 1", 6], ["Weird Questions 2", 6], ["Weird Questions 3", 1]]);
  });
  it("leaves decks of 6 or fewer alone", () => {
    expect(planDeckMoves([...many("A", 6), ...many("B", 1)])).toEqual([]);
  });
  it("is idempotent", () => {
    const qs = [...many("Weird Questions", 9), ...many("Dari Penonton", 8), ...many("Penonton #1", 7)];
    const once = apply(qs, planDeckMoves(qs));
    expect(planDeckMoves(once)).toEqual([]);
    expect(buildDecks(once).every((d) => d.total <= DECK_SIZE)).toBe(true);
  });
  it("turns the old audience pack into Penonton decks", () => {
    const qs = many("Dari Penonton", 8);
    const decks = buildDecks(apply(qs, planDeckMoves(qs)));
    expect(decks.map((d) => [d.name, d.total])).toEqual([["Penonton #1", 6], ["Penonton #2", 2]]);
  });
  it("never moves a card into two decks and never loses one", () => {
    const qs = [...many("X", 10), ...many("Dari Penonton", 4)];
    const after = apply(qs, planDeckMoves(qs));
    expect(after.length).toBe(qs.length);
    expect(new Set(after.map((q) => q.id)).size).toBe(qs.length);
  });
  it("keeps the first 6 of an already numbered deck and moves the overflow to the next number", () => {
    const qs = [...many("Seru 1", 8), ...many("Seru 2", 3)];
    const decks = buildDecks(apply(qs, planDeckMoves(qs)));
    expect(Object.fromEntries(decks.map((d) => [d.name, d.total]))).toEqual({ "Seru 1": 6, "Seru 2": 3, "Seru 3": 2 });
  });
  it("moves overflow of a viewer deck to the next unlocked viewer deck", () => {
    const qs = many("Penonton #1", 8);
    const decks = buildDecks(apply(qs, planDeckMoves(qs)));
    expect(decks.map((d) => [d.name, d.total])).toEqual([["Penonton #1", 6], ["Penonton #2", 2]]);
  });
  it("does not push old audience cards into a deck that is on air", () => {
    const qs = [...many("Penonton #1", 2), ...many("Dari Penonton", 2)];
    const decks = buildDecks(apply(qs, planDeckMoves(qs, new Set(["Penonton #1"]))));
    expect(decks.map((d) => [d.name, d.total])).toEqual([["Penonton #1", 2], ["Penonton #2", 2]]);
  });
});

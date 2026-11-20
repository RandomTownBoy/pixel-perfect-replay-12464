import { describe, expect, it } from "vitest";
import { findDuplicate, isSpam, similar, suspectReason, type DupeItem } from "@/lib/dedupe";

const it_ = (id: string, kind: string, content: string, at: string, fingerprint?: string): DupeItem => ({ id, kind, content, created_at: at, fingerprint });

describe("similar", () => {
  it("mengenali isi sama, beda huruf besar dan tanda baca", () => {
    expect(similar("Kamu pilih apa?", "kamu  PILIH apa")).toBe(true);
  });
  it("mengenali pilihan This or That yang terbalik atau beda format", () => {
    expect(similar("Kopi | Teh", "teh | kopi")).toBe(true);
    expect(similar("Kopi | Teh", "Kopi Teh")).toBe(true);
  });
  it("mengenali typo kecil dan tumpang tindih kata tinggi", () => {
    expect(similar("Makanan favorit kamu apa", "Makanan favorit kamu apaa")).toBe(true);
    expect(similar("kenapa orang suka begadang malam hari", "kenapa orang suka begadang di malam hari")).toBe(true);
  });
  it("tidak menandai teks yang memang berbeda", () => {
    expect(similar("Kopi | Teh", "Nasi | Roti")).toBe(false);
    expect(similar("Hujan", "Panas")).toBe(false);
  });
});

describe("findDuplicate (lintas gimmick)", () => {
  const old = it_("a", "confession", "Aku takut gelap banget", "2026-01-01T10:00:00Z");
  it("isi sama ke gimmick berbeda tetap duplikat", () => {
    expect(findDuplicate(it_("b", "hottake", "aku takut gelap banget!", "2026-01-01T10:01:00Z"), [old])?.id).toBe("a");
  });
  it("hanya kiriman yang datang belakangan yang ditandai", () => {
    const b = it_("b", "hottake", "aku takut gelap banget", "2026-01-01T10:01:00Z");
    expect(findDuplicate(old, [b])).toBeUndefined();
  });
  it("vote dan item itu sendiri diabaikan", () => {
    expect(findDuplicate(old, [old, it_("v", "vote", "aku takut gelap banget", "2026-01-01T09:00:00Z")])).toBeUndefined();
  });
});

describe("isSpam", () => {
  const base = (n: number) => Array.from({ length: n }, (_, i) => it_(`s${i}`, "confession", `isi ${i}`, `2026-01-01T10:00:${String(i * 5).padStart(2, "0")}Z`, "fp1"));
  it("≥3 kiriman dari fingerprint sama dalam 60 detik", () => {
    expect(isSpam(it_("x", "hottake", "baru", "2026-01-01T10:00:30Z", "fp1"), base(3))).toBe(true);
    expect(isSpam(it_("x", "hottake", "baru", "2026-01-01T10:00:30Z", "fp1"), base(2))).toBe(false);
  });
  it("fingerprint berbeda atau di luar jendela waktu tidak dihitung", () => {
    expect(isSpam(it_("x", "hottake", "baru", "2026-01-01T10:00:30Z", "fp2"), base(3))).toBe(false);
    expect(isSpam(it_("x", "hottake", "baru", "2026-01-01T10:05:00Z", "fp1"), base(3))).toBe(false);
  });
  it("suspectReason memberi alasan untuk label Cek", () => {
    expect(suspectReason(it_("b", "chaos", "aku takut gelap banget", "2026-01-01T10:01:00Z"), [it_("a", "confession", "Aku takut gelap banget", "2026-01-01T10:00:00Z")])).toMatch(/duplikat/);
    expect(suspectReason(it_("z", "chaos", "unik sekali", "2026-01-01T10:01:00Z"), [])).toBeNull();
  });
});

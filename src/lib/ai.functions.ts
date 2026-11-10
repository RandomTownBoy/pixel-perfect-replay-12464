import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiTask = "generate" | "improve" | "followup" | "remix" | "thisorthat" | "hottake" | "words" | "problem";
type Input = { task: AiTask; gimmick: string; category: string; count: number; text: string; style: string; avoid: string[] };

const GIMMICK_HINT: Record<string, string> = {
  spin: "pertanyaan untuk roda Spin the Question",
  thisorthat: "pasangan pilihan This or That",
  card: "pertanyaan/prompt singkat untuk kartu misteri Pick a Card",
  hottake: "hot take: opini kontroversial tapi aman dan relatable untuk didiskusikan",
  confession: "prompt Confession Time yang lucu/memalukan ringan, bukan hal sensitif",
  chaos: "ide Random Chaos yang absurd tapi tidak berbahaya",
};

function buildPrompt(d: Input) {
  const n = Math.min(Math.max(d.count || 5, 1), 15);
  const avoid = d.avoid.slice(0, 60).map((a) => `- ${a}`).join("\n");
  const avoidBlock = avoid ? `\n\nJANGAN mengulang atau membuat yang mirip dengan ini:\n${avoid}` : "";
  switch (d.task) {
    case "generate":
      return `Buat ${n} ${GIMMICK_HINT[d.gimmick] ?? "pertanyaan"} dengan kategori "${d.category}".${avoidBlock}`;
    case "thisorthat":
      return `Buat ${n} pasangan This or That untuk kategori "${d.category}". Format tiap baris: pilihan A || pilihan B. Pilihan singkat (maks 6 kata), sama-sama menggoda.${avoidBlock}`;
    case "hottake":
      return `Buat ${n} hot take kontroversial tapi aman dan relatable soal "${d.category}", satu kalimat pendek masing-masing.${avoidBlock}`;
    case "words":
      return `Tulis 3 kata/benda random yang lucu dan beda jauh satu sama lain untuk tantangan bikin cerita dadakan. Masing-masing 1-2 kata.${avoidBlock}`;
    case "problem":
      return `Baris pertama: satu masalah sehari-hari yang aneh tapi tidak berbahaya. ${d.text ? `Gunakan masalah ini apa adanya: "${d.text}".` : ""} Lalu 3 baris solusi absurd dan lucu untuk masalah itu.`;
    case "improve":
      return `Tulis ulang pertanyaan ini jadi 3 versi yang lebih seru, spesifik, dan natural diucapkan saat LIVE:\n${d.text}`;
    case "followup":
      return `Buat 3 pertanyaan lanjutan untuk melanjutkan obrolan dengan penonton setelah membahas:\n${d.text}`;
    case "remix":
      return `Remix pertanyaan ini jadi 3 versi bergaya "${d.style}" (funny = kocak, weird = aneh, deep = dalam, unexpected = plot twist):\n${d.text}`;
  }
}

export const aiGenerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => ({
    ...d,
    text: String(d.text ?? "").slice(0, 500),
    category: String(d.category ?? "").slice(0, 60),
    avoid: Array.isArray(d.avoid) ? d.avoid.map((a) => String(a).slice(0, 200)) : [],
  }))
  .handler(async ({ data }): Promise<{ lines: string[]; error: string | null }> => {
    const { generateLines } = await import("./ai.server");
    try {
      return { lines: await generateLines(buildPrompt(data)), error: null };
    } catch (e) {
      const status = (e as { statusCode?: number; status?: number }).statusCode ?? (e as { status?: number }).status;
      if (status === 429) return { lines: [], error: "AI lagi sibuk, coba lagi sebentar." };
      if (status === 402) return { lines: [], error: "Kredit AI habis. Tambah kredit di pengaturan workspace Lovable." };
      if (status === 403) return { lines: [], error: "Akses AI ditolak untuk workspace ini." };
      console.error("AI error", e);
      return { lines: [], error: "AI gagal menjawab. Coba lagi." };
    }
  });

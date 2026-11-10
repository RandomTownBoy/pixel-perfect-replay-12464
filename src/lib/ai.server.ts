import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const KYOKA_STYLE = `Kamu adalah asisten kreatif untuk kreator TikTok LIVE bernama Kyoka.
Persona Kyoka: kreatif, cool, random, menghibur, sedikit chaos, ramah dan ngobrol santai.
Tulis dalam Bahasa Indonesia sehari-hari yang natural dan santai (boleh "kamu", "gak", "banget"), mudah diucapkan saat LIVE.
Utamakan konten yang memancing penonton bercerita, beropini, dan ikut komen.
Hindari: pertanyaan generik, bahasa formal, lelucon dipaksakan, penjelasan panjang, emoji berlebihan.
Aman untuk semua umur. Jangan minta info pribadi sensitif (alamat, nomor HP, password, data keuangan, kesehatan).
Tulis SETIAP hasil di baris sendiri, tanpa nomor, tanpa bullet, tanpa tanda kutip, tanpa kalimat pembuka atau penutup.`;

export async function generateLines(prompt: string): Promise<string[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI belum dikonfigurasi");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  let streamError: unknown = null;
  const result = streamText({
    onError: ({ error }) => { streamError = error; },
    model: provider.responses("openai/gpt-6-astra"),
    instructions: KYOKA_STYLE,
    messages: [{ role: "user", content: prompt }],
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  let text = "";
  try { text = await result.text; } catch (e) { throw streamError ?? e; }
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter((l) => l.length > 2);
}

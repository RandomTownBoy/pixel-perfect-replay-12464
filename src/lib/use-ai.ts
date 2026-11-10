import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiGenerate, type AiTask } from "@/lib/ai.functions";
import { getQuestions } from "@/lib/kyoka";

export function useAi() {
  const fn = useServerFn(aiGenerate);
  const [loading, setLoading] = useState(false);
  const run = async (p: { task: AiTask; gimmick?: string; category?: string; count?: number; text?: string; style?: string }) => {
    setLoading(true);
    try {
      const avoid = getQuestions().filter((q) => !p.gimmick || q.gimmick === p.gimmick).slice(0, 60).map((q) => q.text);
      const r = await fn({ data: { task: p.task, gimmick: p.gimmick ?? "spin", category: p.category ?? "Random Thoughts", count: p.count ?? 5, text: p.text ?? "", style: p.style ?? "funny", avoid } });
      if (r.error) { toast.error(r.error); return null; }
      if (!r.lines.length) { toast.error("AI gak ngasih hasil, coba lagi."); return null; }
      return r.lines;
    } catch {
      toast.error("Gagal menghubungi AI. Coba lagi.");
      return null;
    } finally { setLoading(false); }
  };
  return { run, loading };
}

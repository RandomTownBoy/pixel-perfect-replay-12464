import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DraftList, Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, GIMMICKS, useKyoka, type GimmickId } from "@/lib/kyoka";
import { useAi } from "@/lib/use-ai";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_studio/ai")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Kyoka Live Studio" },
      { name: "description", content: "Generate, improve and remix livestream questions." },
      { property: "og:title", content: "AI Assistant — Kyoka Live Studio" },
      { property: "og:description", content: "Creative AI helper for livestream content." },
    ],
  }),
  component: AiPage,
});

const TOOLS = [
  { id: "generate", label: "Generate" }, { id: "improve", label: "Improve" },
  { id: "followup", label: "Follow-up" }, { id: "remix", label: "Remix" },
] as const;

function AiPage() {
  const cats = useKyoka((s) => s.categories);
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("generate");
  const [gimmick, setGimmick] = useState<GimmickId>("spin");
  const [cat, setCat] = useState<string>(cats[0] ?? "Daily Life");
  const [count, setCount] = useState(5);
  const [input, setInput] = useState("");
  const [style, setStyle] = useState("funny");
  const [drafts, setDrafts] = useState<string[]>([]);

  const ai = useAi();
  const run = async () => {
    if (tool !== "generate" && !input.trim()) return void toast("Tulis pertanyaan dulu");
    const task = tool === "generate" ? (gimmick === "thisorthat" ? "thisorthat" : gimmick === "hottake" ? "hottake" : "generate") : tool;
    const l = await ai.run({ task, gimmick, category: cat, count, text: input, style });
    if (l) setDrafts(l);
  };

  return (
    <>
      <PageHeader title="AI Assistant" sub="Bahasa santai, gampang diucapin pas LIVE. Hasil selalu bisa diedit dulu." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-4">
          <div className="inline-flex flex-wrap rounded-xl bg-muted p-1">
            {TOOLS.map((t) => (
              <button key={t.id} onClick={() => { setTool(t.id); setDrafts([]); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tool === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={gimmick} onChange={(e) => setGimmick(e.target.value as GimmickId)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              {GIMMICKS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {tool === "generate" ? (
            <label className="flex items-center gap-3 text-sm">Jumlah <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(+e.target.value)} className="w-24" /></label>
          ) : (
            <Input placeholder="Tempel pertanyaan yang mau diolah…" value={input} onChange={(e) => setInput(e.target.value)} />
          )}
          {tool === "remix" && (
            <div className="flex flex-wrap gap-1.5">
              {["funny", "weird", "deep", "unexpected"].map((s) => <button key={s} onClick={() => setStyle(s)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${style === s ? "bg-pop text-background" : "bg-muted text-muted-foreground"}`}>{s}</button>)}
            </div>
          )}
          <Button size="lg" variant="live" className="w-full" disabled={ai.loading} onClick={run}>{ai.loading ? <><Loader2 className="animate-spin" /> AI lagi mikir…</> : <><Sparkles /> Jalankan</>}</Button>
          <p className="text-xs text-muted-foreground">AI melihat isi Question Bank supaya gak ngulang. Duplikat persis otomatis dilewati. Untuk This or That, format: A || B.</p>
        </Panel>
        <Panel>
          {drafts.length ? (
            <DraftList drafts={drafts} setDrafts={setDrafts} onSave={(d) => {
              const n = actions.addQuestions(d.map((text) => ({ text, gimmick, category: cat })));
              toast(n ? `${n} disimpan` : "Semua sudah ada di bank"); setDrafts([]);
            }} />
          ) : <p className="py-16 text-center text-sm text-muted-foreground">Hasil akan muncul di sini.</p>}
        </Panel>
      </div>
    </>
  );
}

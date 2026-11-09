import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Star, Trash2, RotateCcw, Check } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, GIMMICKS, SAMPLE_QUESTIONS, useKyoka } from "@/lib/kyoka";

export const Route = createFileRoute("/_authenticated/_studio/bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — Kyoka Live Studio" },
      { name: "description", content: "Search, organize and reuse saved livestream questions." },
      { property: "og:title", content: "Question Bank — Kyoka Live Studio" },
      { property: "og:description", content: "Your library of livestream questions and prompts." },
    ],
  }),
  component: Bank,
});

function Bank() {
  const qs = useKyoka((s) => s.questions);
  const cats = useKyoka((s) => s.categories);
  const [search, setSearch] = useState("");
  const [g, setG] = useState("all");
  const [c, setC] = useState("all");
  const [status, setStatus] = useState("all");
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const list = useMemo(() => qs.filter((q) =>
    (g === "all" || q.gimmick === g) && (c === "all" || q.category === c) &&
    (status === "all" || (status === "fav" ? q.favorite : status === "used" ? q.used : !q.used)) &&
    q.text.toLowerCase().includes(search.toLowerCase())), [qs, g, c, status, search]);

  const sel = "h-10 rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <>
      <PageHeader title="Question Bank" sub={`${qs.length} konten · ${qs.filter((q) => q.used).length} sudah dipakai`} />
      <Panel className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Cari…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-48 flex-1" />
        <select className={sel} value={g} onChange={(e) => setG(e.target.value)}><option value="all">Semua gimmick</option>{GIMMICKS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select className={sel} value={c} onChange={(e) => setC(e.target.value)}><option value="all">Semua kategori</option>{cats.map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Semua</option><option value="fav">Favorit</option><option value="unused">Belum dipakai</option><option value="used">Sudah dipakai</option></select>
        <div className="flex gap-1"><Input placeholder="Kategori baru" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-36" /><Button variant="secondary" onClick={() => { actions.addCategory(newCat); setNewCat(""); }}>Tambah</Button></div>
      </Panel>
      <div className="space-y-2">
        {list.map((q) => {
          const gm = GIMMICKS.find((x) => x.id === q.gimmick)!;
          return (
            <div key={q.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 ${q.used ? "opacity-55" : ""}`}>
              <span className="text-xl">{gm.emoji}</span>
              <div className="min-w-0 flex-1">
                {editing?.id === q.id ? (
                  <div className="flex gap-1"><Input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                    <Button size="icon" onClick={() => { actions.updateQuestion(q.id, { text: editing.text }); setEditing(null); }}><Check /></Button></div>
                ) : <p className="cursor-text text-sm" onClick={() => setEditing({ id: q.id, text: q.text })}>{q.text}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{gm.name} · {q.category} · {new Date(q.createdAt).toLocaleDateString()} {q.demo && "· DEMO"} {q.used && "· dipakai"}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => actions.updateQuestion(q.id, { favorite: !q.favorite })}><Star className={q.favorite ? "fill-zest text-zest" : ""} /></Button>
              <Button size="icon" variant="ghost" title="Toggle dipakai" onClick={() => actions.updateQuestion(q.id, { used: !q.used })}><RotateCcw /></Button>
              <Button size="icon" variant="ghost" onClick={() => actions.deleteQuestion(q.id)}><Trash2 /></Button>
            </div>
          );
        })}
        {!qs.length && (
          <div className="py-10 text-center">
            <p className="mb-3 text-sm text-muted-foreground">Bank masih kosong.</p>
            <Button variant="live" onClick={() => actions.addQuestions(SAMPLE_QUESTIONS().map((q) => ({ text: q.text, gimmick: q.gimmick, category: q.category, demo: true })))}>Muat contoh pertanyaan</Button>
          </div>
        )}
        {!!qs.length && !list.length && <p className="py-10 text-center text-sm text-muted-foreground">Gak ada yang cocok.</p>}
      </div>
    </>
  );
}

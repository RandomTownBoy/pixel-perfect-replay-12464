import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  actions, DEMO, demoGenerate, sample, sendToOverlay, useKyoka, type GimmickId,
} from "@/lib/kyoka";
import { Send, Shuffle, SkipForward, RotateCw, Plus, Trash2, Save, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-panel p-5 ${className}`}>{children}</div>;
}
function Stage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-background/50 p-6 text-center">{children}</div>;
}
function SendBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button size="lg" variant="live" onClick={onClick} disabled={disabled}><Send /> Tampilkan di Overlay</Button>;
}
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cats = useKyoka((s) => s.categories);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
      {cats.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}
function markUsed(text: string) {
  const q = useKyokaSnapshotFind(text);
  if (q) actions.updateQuestion(q.id, { used: true });
}
let snap: { id: string; text: string }[] = [];
function useKyokaSnapshotFind(text: string) { return snap.find((x) => x.text === text); }

/* ---------------- SPIN ---------------- */
export function SpinGimmick() {
  const all = useKyoka((s) => s.questions);
  snap = all;
  const [category, setCategory] = useState("Daily Life");
  const [count, setCount] = useState(5);
  const [manual, setManual] = useState("");
  const pool = useMemo(() => all.filter((q) => q.gimmick === "spin" && q.category === category && !q.used).slice(0, 10), [all, category]);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);

  const spin = () => {
    if (!pool.length) { toast("Belum ada pertanyaan di kategori ini"); return; }
    const idx = Math.floor(Math.random() * pool.length);
    const seg = 360 / pool.length;
    const target = rot + 360 * 5 + (360 - (rot % 360)) - (idx * seg + seg / 2);
    setSpinning(true); setPicked(null); setRot(target);
    sendToOverlay({ gimmick: "spin", spinning: true, category });
    setTimeout(() => { setSpinning(false); setPicked(pool[idx]?.text ?? null); }, 3600);
  };
  const colors = ["var(--primary)", "var(--electric)", "var(--pop)", "var(--chart-5)", "var(--zest)"];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2"><CategorySelect value={category} onChange={(c) => { setCategory(c); setPicked(null); }} /></div>
        <div className="flex flex-col items-center gap-5">
          <div className="relative h-72 w-72">
            <div className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-zest" />
            <svg viewBox="-100 -100 200 200" className="h-full w-full drop-shadow-xl" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? "transform 3.5s cubic-bezier(.15,.85,.2,1)" : "none" }}>
              {(pool.length ? pool : [{ id: "x", text: "?" }]).map((q, i, arr) => {
                const seg = (2 * Math.PI) / arr.length; const a0 = i * seg - Math.PI / 2; const a1 = a0 + seg;
                const large = seg > Math.PI ? 1 : 0;
                const d = arr.length === 1 ? "M0,-98 A98,98 0 1,1 -0.01,-98 Z" : `M0,0 L${98 * Math.cos(a0)},${98 * Math.sin(a0)} A98,98 0 ${large},1 ${98 * Math.cos(a1)},${98 * Math.sin(a1)} Z`;
                return (
                  <g key={q.id}>
                    <path d={d} style={{ fill: colors[i % colors.length] }} stroke="var(--background)" strokeWidth="1.5" />
                    <text x={60 * Math.cos(a0 + seg / 2)} y={60 * Math.sin(a0 + seg / 2)} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="800" style={{ fill: "var(--background)" }}>{i + 1}</text>
                  </g>
                );
              })}
              <circle r="16" style={{ fill: "var(--background)" }} />
            </svg>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={spin} disabled={spinning}><RotateCw /> {picked ? "Spin Lagi" : "SPIN!"}</Button>
          </div>
          {picked && (
            <Stage>
              <p className="animate-pop-in font-display text-xl font-bold">{picked}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <SendBtn onClick={() => sendToOverlay({ gimmick: "spin", question: picked, category })} />
                <Button variant="secondary" onClick={() => { markUsed(picked); setPicked(null); spin(); }}><SkipForward /> Next</Button>
                <Button variant="ghost" onClick={() => { setPicked(null); }}>Skip</Button>
              </div>
            </Stage>
          )}
        </div>
      </Panel>
      <Panel className="space-y-4">
        <h3 className="font-display text-sm font-bold">Isi roda ({pool.length})</h3>
        <div className="flex gap-2">
          <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(+e.target.value)} className="w-20" />
          <Button variant="secondary" className="flex-1" onClick={() => setDrafts(demoGenerate(category, count))}><Sparkles /> Generate (Demo AI)</Button>
        </div>
        {drafts.length > 0 && (
          <DraftList drafts={drafts} setDrafts={setDrafts} onSave={(d) => { actions.addQuestions(d.map((text) => ({ text, gimmick: "spin", category }))); setDrafts([]); }} />
        )}
        <div className="flex gap-2">
          <Input placeholder="Tulis pertanyaan sendiri…" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button size="icon" onClick={() => { if (actions.addQuestions([{ text: manual, gimmick: "spin", category }])) setManual(""); else toast("Pertanyaan kosong atau sudah ada"); }}><Plus /></Button>
        </div>
        <ul className="max-h-72 space-y-1.5 overflow-auto text-sm">
          {pool.map((q, i) => (
            <EditableRow key={q.id} index={i + 1} text={q.text} onSave={(t) => actions.updateQuestion(q.id, { text: t })} onDelete={() => actions.deleteQuestion(q.id)} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function EditableRow({ text, index, onSave, onDelete }: { text: string; index: number; onSave: (t: string) => void; onDelete: () => void }) {
  const [v, setV] = useState(text);
  const [edit, setEdit] = useState(false);
  return (
    <li className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5">
      <span className="w-5 text-xs text-muted-foreground">{index}</span>
      {edit ? <Input value={v} onChange={(e) => setV(e.target.value)} className="h-8" /> : <span className="flex-1 cursor-text" onClick={() => setEdit(true)}>{text}</span>}
      {edit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onSave(v); setEdit(false); }}><Check /></Button>}
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={onDelete}><Trash2 /></Button>
    </li>
  );
}

export function DraftList({ drafts, setDrafts, onSave }: { drafts: string[]; setDrafts: (d: string[]) => void; onSave: (d: string[]) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-electric/40 bg-electric/5 p-3">
      <p className="text-xs font-semibold text-electric">Hasil AI (Demo) — edit dulu sebelum disimpan</p>
      {drafts.map((d, i) => (
        <div key={i} className="flex gap-1.5">
          <Input value={d} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))} className="h-9 text-sm" />
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <Button size="sm" className="w-full" onClick={() => onSave(drafts)}><Save /> Simpan ke Question Bank</Button>
    </div>
  );
}

/* ---------------- THIS OR THAT ---------------- */
export function ThisOrThatGimmick() {
  const cd = useKyoka((s) => s.settings.countdown);
  const [pair, setPair] = useState<[string, string]>(DEMO.thisOrThat[0]!);
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [timer, setTimer] = useState(true);
  const [k, setK] = useState(0);
  const next = () => { setPair(sample(DEMO.thisOrThat.filter((p) => p[0] !== pair[0]), 1)[0] ?? pair); setK(k + 1); };
  return (
    <Panel className="space-y-5">
      <Stage>
        <div key={k} className="grid w-full max-w-xl gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="animate-pop-in rounded-2xl bg-primary p-5 font-display text-lg font-bold text-primary-foreground">{pair[0]}</div>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zest font-display font-black text-background">VS</span>
          <div className="animate-pop-in rounded-2xl bg-electric p-5 font-display text-lg font-bold text-background [animation-delay:.15s]">{pair[1]}</div>
        </div>
      </Stage>
      <div className="flex flex-wrap items-center gap-2">
        <SendBtn onClick={() => sendToOverlay({ gimmick: "thisorthat", a: pair[0], b: pair[1], countdownEnd: timer ? Date.now() + cd * 1000 : undefined })} />
        <Button size="lg" variant="secondary" onClick={next}><Shuffle /> Next Round</Button>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} /> Countdown {cd}s</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Pilihan A" value={a} onChange={(e) => setA(e.target.value)} className="flex-1" />
        <Input placeholder="Pilihan B" value={b} onChange={(e) => setB(e.target.value)} className="flex-1" />
        <Button variant="secondary" onClick={() => { if (a && b) { setPair([a, b]); setK(k + 1); setA(""); setB(""); } }}>Pakai</Button>
      </div>
    </Panel>
  );
}

/* ---------------- PICK A CARD ---------------- */
export function CardGimmick() {
  const all = useKyoka((s) => s.questions);
  snap = all;
  const packs = useMemo(() => [...new Set(all.filter((q) => q.gimmick === "card").map((q) => q.category))], [all]);
  const [pack, setPack] = useState<string>("all");
  const [deck, setDeck] = useState<string[]>(() => []);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [newCard, setNewCard] = useState("");
  const source = all.filter((q) => q.gimmick === "card" && (pack === "all" || q.category === pack)).map((q) => q.text);
  const deal = () => { setDeck(sample(source, Math.min(6, source.length))); setFlipped(null); sendToOverlay({ gimmick: "card", count: Math.min(6, source.length) }); };
  const cards = deck.length ? deck : source.slice(0, 6);
  return (
    <Panel className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <select value={pack} onChange={(e) => { setPack(e.target.value); setDeck([]); setFlipped(null); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="all">Semua pack</option>{packs.map((p) => <option key={p}>{p}</option>)}
        </select>
        <Button variant="secondary" onClick={deal}><Shuffle /> Kocok & Bagikan</Button>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {cards.map((c, i) => (
          <button key={c + i} className="flip-card aspect-[3/4]" onClick={() => { setFlipped(i); sendToOverlay({ gimmick: "card", count: cards.length, revealed: i, text: c }); markUsed(c); }}>
            <div className={`flip-inner h-full w-full ${flipped === i ? "flipped" : ""}`}>
              <div className="flip-face flex items-center justify-center rounded-xl border border-primary/50 bg-party font-display text-2xl font-black shadow-glow">{i + 1}</div>
              <div className="flip-face flip-back flex items-center justify-center rounded-xl bg-card p-2 text-[11px] font-semibold leading-tight">{c}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Klik kartu untuk membuka — langsung tampil di overlay.</p>
      <div className="flex gap-2">
        <Input placeholder="Tambah kartu ke pack…" value={newCard} onChange={(e) => setNewCard(e.target.value)} />
        <Button onClick={() => { if (actions.addQuestions([{ text: newCard, gimmick: "card", category: pack === "all" ? "Random Thoughts" : pack }])) setNewCard(""); }}><Plus /></Button>
      </div>
    </Panel>
  );
}

/* ---------------- HOT TAKE ---------------- */
export function HotTakeGimmick() {
  const all = useKyoka((s) => s.questions);
  const pool = all.filter((q) => q.gimmick === "hottake" && !q.used);
  const [i, setI] = useState(0);
  const cur = pool[i % Math.max(pool.length, 1)];
  const [fu, setFu] = useState<string[]>([]);
  if (!cur) return <Panel><Stage><p>Semua hot take sudah dipakai. Generate lagi di AI Assistant atau reset di Question Bank.</p></Stage></Panel>;
  return (
    <Panel className="space-y-5">
      <Stage>
        <span className="text-5xl">🔥</span>
        <p key={cur.id} className="animate-pop-in font-display text-xl font-bold">“{cur.text}”</p>
        {fu.length > 0 && <ul className="space-y-1 text-sm text-muted-foreground">{fu.map((f) => <li key={f}>💬 {f}</li>)}</ul>}
      </Stage>
      <div className="flex flex-wrap gap-2">
        <SendBtn onClick={() => sendToOverlay({ gimmick: "hottake", topic: cur.text, followups: fu })} />
        <Button size="lg" variant="secondary" onClick={() => setFu(sample(DEMO.followups, 3))}><Sparkles /> Follow-up</Button>
        <Button size="lg" variant="secondary" onClick={() => { setI(i + 1); setFu([]); }}><SkipForward /> Next</Button>
        <Button size="lg" variant="ghost" onClick={() => { actions.updateQuestion(cur.id, { used: true }); setFu([]); }}><Check /> Tandai dipakai</Button>
      </div>
    </Panel>
  );
}

/* ---------------- CONFESSION ---------------- */
const CONF_CATS = ["Funny", "Embarrassing", "Friendship", "School", "Habits", "Everyday"];
export function ConfessionGimmick() {
  const all = useKyoka((s) => s.questions);
  const pool = all.filter((q) => q.gimmick === "confession");
  const [i, setI] = useState(0);
  const [cat, setCat] = useState("Funny");
  const [custom, setCustom] = useState("");
  const [fu, setFu] = useState<string[]>([]);
  const cur = pool[i % Math.max(pool.length, 1)];
  return (
    <Panel className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {CONF_CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs font-semibold ${cat === c ? "bg-pop text-background" : "bg-muted text-muted-foreground"}`}>{c}</button>)}
      </div>
      <Stage>
        <span className="text-5xl">🤫</span>
        <p key={cur?.id} className="animate-pop-in font-display text-xl font-bold">{cur?.text ?? "Belum ada prompt"}</p>
        {fu.length > 0 && <ul className="space-y-1 text-sm text-muted-foreground">{fu.map((f) => <li key={f}>💬 {f}</li>)}</ul>}
      </Stage>
      <div className="flex flex-wrap gap-2">
        <SendBtn disabled={!cur} onClick={() => cur && sendToOverlay({ gimmick: "confession", prompt: cur.text, category: cat })} />
        <Button size="lg" variant="secondary" onClick={() => { setI(i + 1); setFu([]); }}><SkipForward /> Next</Button>
        <Button size="lg" variant="secondary" onClick={() => setFu(sample(DEMO.followups, 2))}><Sparkles /> Follow-up</Button>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Prompt confession sendiri…" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button onClick={() => { if (actions.addQuestions([{ text: custom, gimmick: "confession", category: cat }])) { setCustom(""); setI(0); } }}><Plus /></Button>
      </div>
      <p className="text-xs text-muted-foreground">Tip: jangan minta penonton membagikan info pribadi yang sensitif.</p>
    </Panel>
  );
}

/* ---------------- CHAOS ---------------- */
export function ChaosGimmick() {
  const [mode, setMode] = useState<"story" | "solution">("story");
  const [words, setWords] = useState(() => DEMO.words.slice(0, 3));
  const [problem, setProblem] = useState(DEMO.problems[0]!);
  const [sols, setSols] = useState(() => DEMO.solutions.slice(0, 3));
  const [audience, setAudience] = useState("");
  return (
    <Panel className="space-y-5">
      <div className="inline-flex rounded-xl bg-muted p-1">
        {(["story", "solution"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {m === "story" ? "Random Story" : "Random Solution"}
          </button>
        ))}
      </div>
      {mode === "story" ? (
        <>
          <Stage>
            <div className="flex flex-wrap justify-center gap-3">
              {words.map((w, i) => <span key={w} className="animate-pop-in rounded-xl bg-party px-5 py-3 font-display text-xl font-bold shadow-pop" style={{ animationDelay: `${i * 0.15}s` }}>{w}</span>)}
            </div>
          </Stage>
          <div className="flex flex-wrap gap-2">
            <SendBtn onClick={() => sendToOverlay({ gimmick: "chaos", mode: "story", words })} />
            <Button size="lg" variant="secondary" onClick={() => setWords(sample(DEMO.words, 3))}><Shuffle /> Regenerate</Button>
          </div>
        </>
      ) : (
        <>
          <Stage>
            <p className="font-display text-lg font-bold">{problem}</p>
            <ol className="space-y-1 text-sm">{sols.map((s, i) => <li key={s}><b className="text-zest">{i + 1}.</b> {s}</li>)}</ol>
          </Stage>
          <div className="flex flex-wrap gap-2">
            <SendBtn onClick={() => sendToOverlay({ gimmick: "chaos", mode: "solution", problem, solutions: sols })} />
            <Button size="lg" variant="secondary" onClick={() => { setProblem(sample(DEMO.problems.filter((p) => p !== problem), 1)[0] ?? problem); setSols(sample(DEMO.solutions, 3)); }}><Shuffle /> Masalah Baru</Button>
            <Button size="lg" variant="ghost" onClick={() => setSols(sample(DEMO.solutions, 3))}>Solusi Lain</Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Masalah dari penonton…" value={audience} onChange={(e) => setAudience(e.target.value)} />
            <Button onClick={() => { if (audience) { setProblem(audience); setSols(sample(DEMO.solutions, 3)); setAudience(""); } }}>Pakai</Button>
          </div>
        </>
      )}
    </Panel>
  );
}

export const GIMMICK_COMPONENTS: Record<GimmickId, () => React.ReactElement> = {
  spin: SpinGimmick, thisorthat: ThisOrThatGimmick, card: CardGimmick, hottake: HotTakeGimmick, confession: ConfessionGimmick, chaos: ChaosGimmick,
};

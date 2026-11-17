import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  actions, DEFAULT_CATEGORIES, DEMO, getQuestions, readOverlay, sample, sendToOverlay, SPIN_DURATION_MS, SPIN_EASING, spinPoolOf, subscribeOverlay,
  updateOverlayPayload, useKyoka, VIEWER_CATEGORY, type GimmickId, type OverlayPayload,
} from "@/lib/kyoka";
import { SpinWheelSvg } from "@/components/SpinWheel";
import { Send, Shuffle, SkipForward, RotateCw, Plus, Trash2, Save, Sparkles, Check, Tv } from "lucide-react";
import { toast } from "sonner";
import { useAi } from "@/lib/use-ai";
import { Loader2 } from "lucide-react";
import { AudienceHistory } from "@/components/AudienceHistory";
import { WaitingQueue } from "@/components/WaitingQueue";
import { CardGimmick } from "@/components/CardDecks";

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 break-words rounded-2xl border border-border bg-panel p-5 ${className}`}>{children}</div>;
}
function Stage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-background/50 p-6 text-center">{children}</div>;
}
function SendBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <Button size="lg" variant="live" onClick={onClick} disabled={disabled}><Send /> Tampilkan di Overlay</Button>;
}
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cats = useKyoka((s) => s.categories);
  const qs = useKyoka((s) => s.questions);
  // Nama deck Pick a Card (disimpan di kolom kategori) tidak ikut jadi pilihan kategori gimmick lain.
  const deckOnly = useMemo(() => {
    const cardCats = new Set(qs.filter((q) => q.gimmick === "card").map((q) => q.category));
    for (const q of qs) if (q.gimmick !== "card") cardCats.delete(q.category);
    for (const d of DEFAULT_CATEGORIES) cardCats.delete(d);
    return cardCats;
  }, [qs]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
      {cats.filter((c) => !deckOnly.has(c) || c === value).map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}
function markUsed(text: string) {
  const q = useKyokaSnapshotFind(text);
  if (q) actions.updateQuestion(q.id, { used: true });
}
let snap: { id: string; text: string }[] = [];

/** Payload overlay yang sedang tayang (diperbarui realtime), untuk tahu apakah roda/kartu/cerita sedang ada di overlay. */
function useOverlayPayload(): OverlayPayload | null {
  const [p, setP] = useState<OverlayPayload | null>(null);
  useEffect(() => {
    setP(readOverlay().payload);
    return subscribeOverlay((s) => setP(s.payload));
  }, []);
  return p;
}
function useKyokaSnapshotFind(text: string) { return snap.find((x) => x.text === text); }

/* ---------------- SPIN ---------------- */
export function SpinGimmick() {
  const all = useKyoka((s) => s.questions);
  const spinCapacity = useKyoka((s) => s.settings.spinCapacity);
  const spinSlices = useKyoka((s) => s.settings.spinSlices);
  const spinModeration = useKyoka((s) => s.settings.spinModeration);
  snap = all;
  const [category, setCategory] = useState("Daily Life");
  const [count, setCount] = useState(5);
  const [manual, setManual] = useState("");
  const pool = useMemo(() => spinPoolOf(all, category, spinSlices), [all, category, spinSlices]);
  const viewerQuestions = all.filter((q) => q.gimmick === "spin" && q.category === VIEWER_CATEGORY && !q.used);
  const viewerCount = viewerQuestions.length;
  const usedViewerCount = all.filter((q) => q.gimmick === "spin" && q.category === VIEWER_CATEGORY && q.used).length;
  const waitingCount = Math.max(0, viewerCount - spinSlices);
  const capacityPercent = Math.min(100, (viewerCount / Math.max(1, spinCapacity)) * 100);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const ai = useAi();

  // Roda "tayang di overlay" = payload spin yang sudah memakai fase (phase). Payload lama (tanpa phase) tidak dihitung.
  const ov = useOverlayPayload();
  const wheelLive = ov?.gimmick === "spin" && ov.phase !== undefined;
  const resultShown = ov?.gimmick === "spin" && ov.phase === "result";
  const isWheelLive = () => { const c = readOverlay().payload; return c?.gimmick === "spin" && c.phase !== undefined; };
  const poolTexts = (c: string) => spinPoolOf(getQuestions(), c, spinSlices).map((q) => q.text);

  const showWheel = () => {
    sendToOverlay({ gimmick: "spin", phase: "standby", items: pool.map((q) => q.text), category, rotation: rot });
  };
  /** Kembalikan overlay ke standby dengan isi roda terbaru (in-place, tanpa remount). */
  const backToStandby = (c = category, markAdded = false) => {
    const items = poolTexts(c);
    updateOverlayPayload({
      gimmick: "spin", phase: "standby", items, category: c, rotation: rot,
      added: markAdded && items.length ? items : undefined, addedAt: markAdded && items.length ? Date.now() : undefined,
    });
  };
  const chooseCategory = (c: string) => {
    if (spinning) return;
    setCategory(c); setPicked(null);
    // Pertanyaan penonton dihitung sebagai penambahan ke roda; kategori biasa hanya mengganti isi roda.
    if (isWheelLive()) backToStandby(c, c === VIEWER_CATEGORY);
  };

  const spin = () => {
    const activePool = spinPoolOf(getQuestions(), category, spinSlices);
    if (!activePool.length) { toast("Belum ada pertanyaan di kategori ini"); return; }
    const idx = Math.floor(Math.random() * activePool.length);
    const seg = 360 / activePool.length;
    const target = rot + 360 * 5 + (360 - (rot % 360)) - (idx * seg + seg / 2);
    const winner = activePool[idx]?.text ?? null;
    const live = isWheelLive();
    const startedAt = Date.now();
    setSpinning(true); setPicked(null); setRot(target);
    if (live) {
      updateOverlayPayload({
        gimmick: "spin", phase: "spinning", items: activePool.map((q) => q.text), category, rotation: target, fromRotation: rot,
        winnerIndex: idx, durationMs: SPIN_DURATION_MS, startedAt,
      });
    } else {
      sendToOverlay({ gimmick: "spin", spinning: true, category });
    }
    setTimeout(() => {
      setSpinning(false); setPicked(winner);
      if (!live || !winner) return;
      const cur = readOverlay().payload;
      // Hanya lanjut kalau overlay masih memutar roda yang sama (tidak diganti gimmick lain / dikirim ulang).
      if (cur?.gimmick === "spin" && cur.phase === "spinning" && cur.startedAt === startedAt) updateOverlayPayload({ ...cur, phase: "result", question: winner });
    }, SPIN_DURATION_MS + 100);
  };

  return (
    <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CategorySelect value={category} onChange={chooseCategory} />
          {viewerCount > 0 && category !== VIEWER_CATEGORY && (
            <Button size="sm" variant="secondary" onClick={() => chooseCategory(VIEWER_CATEGORY)}>🙋 Pertanyaan penonton ({viewerCount})</Button>
          )}
          <Button size="sm" variant="live" disabled={spinning} onClick={showWheel}><Tv /> Tampilkan Roda di Overlay</Button>
        </div>
        <div className="flex flex-col items-center gap-5">
          <div className="relative aspect-square w-full max-w-72">
            <div className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-zest" />
            <SpinWheelSvg count={pool.length} className="h-full w-full drop-shadow-xl" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_DURATION_MS / 1000}s ${SPIN_EASING}` : "none" }} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={spin} disabled={spinning}><RotateCw /> {picked ? "Spin Lagi" : "SPIN!"}</Button>
          </div>
          {picked && (
            <Stage>
              <p className="animate-pop-in font-display text-xl font-bold">{picked}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {resultShown
                  ? <span className="flex h-11 items-center gap-1.5 rounded-lg bg-success/15 px-3 text-sm font-semibold text-success"><Check className="h-4 w-4" /> Tampil di overlay</span>
                  : <SendBtn onClick={() => sendToOverlay({ gimmick: "spin", question: picked, category })} />}
                <Button variant="secondary" onClick={() => {
                  markUsed(picked); setPicked(null);
                  if (wheelLive) backToStandby();
                }}><SkipForward /> Next</Button>
                <Button variant="ghost" onClick={() => { setPicked(null); if (wheelLive) backToStandby(); }}>Skip</Button>
              </div>
            </Stage>
          )}
        </div>
      </Panel>
      <Panel className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><h3 className="font-display text-sm font-bold">Isi roda</h3><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{pool.length}/{spinSlices} irisan</span></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">Kapasitas antrean<Input type="number" min={1} max={300} value={spinCapacity} onChange={(e) => actions.updateSettings({ spinCapacity: Math.max(1, Math.min(300, Number(e.target.value) || 1)) })} className="h-9 text-sm text-foreground" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Jumlah irisan<Input type="number" min={1} max={300} value={spinSlices} onChange={(e) => actions.updateSettings({ spinSlices: Math.max(1, Math.min(300, Number(e.target.value) || 1)) })} className="h-9 text-sm text-foreground" /></label>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold">Moderasi pertanyaan</span><span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">{spinModeration === "auto" ? "Otomatis" : "Manual"}</span></div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button type="button" onClick={() => actions.updateSettings({ spinModeration: "auto" })} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${spinModeration === "auto" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Otomatis</button>
              <button type="button" onClick={() => actions.updateSettings({ spinModeration: "manual" })} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${spinModeration === "manual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Periksa manual</button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Otomatis menggunakan penyaringan kiriman yang tersedia. Mode manual menandai alur persetujuan host sebelum pertanyaan dipakai.</p>
          </div>
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Kapasitas pertanyaan penonton</span><b>{viewerCount}/{spinCapacity}</b></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${capacityPercent}%` }} /></div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div><b className="block text-sm">{Math.min(viewerCount, spinSlices)}</b><span className="text-muted-foreground">Di roda</span></div>
              <div><b className="block text-sm">{waitingCount}</b><span className="text-muted-foreground">Menunggu</span></div>
              <div><b className="block text-sm">{usedViewerCount}</b><span className="text-muted-foreground">Terpakai</span></div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Input type="number" min={1} max={100} value={count} onChange={(e) => setCount(+e.target.value)} className="w-20" />
          <Button variant="secondary" className="flex-1" disabled={ai.loading} onClick={async () => { const l = await ai.run({ task: "generate", gimmick: "spin", category, count }); if (l) setDrafts(l); }}>{ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate AI</Button>
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
    <Panel><AudienceHistory gimmick="spin" /></Panel>
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
      <p className="text-xs font-semibold text-electric">Hasil AI — edit dulu sebelum disimpan</p>
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
  const saved = useKyoka((s) => s.questions).filter((q) => q.gimmick === "thisorthat" && q.text.includes("||")).map((q) => q.text.split("||").map((x) => x.trim()) as [string, string]);
  const pool = [...saved, ...DEMO.thisOrThat];
  const [queue, setQueue] = useState<[string, string][]>([]);
  const ai = useAi();
  const next = () => {
    if (queue.length) { setPair(queue[0]!); setQueue(queue.slice(1)); }
    else setPair(sample(pool.filter((p) => p[0] !== pair[0]), 1)[0] ?? pair);
    setK(k + 1);
  };
  const aiPairs = async () => {
    const l = await ai.run({ task: "thisorthat", gimmick: "thisorthat", category: "Random Thoughts", count: 6 });
    const pairs = (l ?? []).map((x) => x.split("||").map((y) => y.trim())).filter((x) => x.length === 2 && x[0] && x[1]) as [string, string][];
    if (!pairs.length) return;
    actions.addQuestions(pairs.map((p) => ({ text: `${p[0]} || ${p[1]}`, gimmick: "thisorthat", category: "Random Thoughts" })));
    setPair(pairs[0]!); setQueue(pairs.slice(1)); setK(k + 1);
    toast.success(`${pairs.length} pasangan baru dari AI`);
  };
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
        <Button size="lg" variant="secondary" disabled={ai.loading} onClick={aiPairs}>{ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} AI Pasangan</Button>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} /> Countdown {cd}s</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Pilihan A" value={a} onChange={(e) => setA(e.target.value)} className="flex-1" />
        <Input placeholder="Pilihan B" value={b} onChange={(e) => setB(e.target.value)} className="flex-1" />
        <Button variant="secondary" onClick={() => { if (a && b) { setPair([a, b]); setK(k + 1); setA(""); setB(""); } }}>Pakai</Button>
      </div>
      <WaitingQueue kind="thisorthat" />
      <AudienceHistory gimmick="thisorthat" />
    </Panel>
  );
}

/* ---------------- PICK A CARD: sistem deck ada di CardDecks.tsx ---------------- */

/* ---------------- HOT TAKE ---------------- */
export function HotTakeGimmick() {
  const all = useKyoka((s) => s.questions);
  const pool = all.filter((q) => q.gimmick === "hottake" && !q.used);
  const [i, setI] = useState(0);
  const cur = pool[i % Math.max(pool.length, 1)];
  const [fu, setFu] = useState<string[]>([]);
  const ai = useAi();
  const more = async () => { const l = await ai.run({ task: "hottake", gimmick: "hottake", category: "kehidupan sehari-hari", count: 5 }); if (l) { actions.addQuestions(l.map((text) => ({ text, gimmick: "hottake", category: "Random Thoughts" }))); toast.success("Hot take baru masuk"); } };
  if (!cur) return <Panel className="space-y-5"><Stage><p>Semua hot take sudah dipakai.</p><Button variant="live" disabled={ai.loading} onClick={more}><Sparkles /> Bikin hot take baru (AI)</Button></Stage><AudienceHistory gimmick="hottake" /></Panel>;
  return (
    <Panel className="space-y-5">
      <Stage>
        <span className="text-5xl">🔥</span>
        <p key={cur.id} className="animate-pop-in font-display text-xl font-bold">“{cur.text}”</p>
        {fu.length > 0 && <ul className="space-y-1 text-sm text-muted-foreground">{fu.map((f) => <li key={f}>💬 {f}</li>)}</ul>}
      </Stage>
      <div className="flex flex-wrap gap-2">
        <SendBtn onClick={() => sendToOverlay({ gimmick: "hottake", topic: cur.text, followups: fu })} />
        <Button size="lg" variant="secondary" disabled={ai.loading} onClick={async () => { const l = await ai.run({ task: "followup", text: cur.text }); if (l) setFu(l.slice(0, 3)); }}>{ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Follow-up AI</Button>
        <Button size="lg" variant="secondary" onClick={() => { setI(i + 1); setFu([]); }}><SkipForward /> Next</Button>
        <Button size="lg" variant="ghost" disabled={ai.loading} onClick={more}>+ Hot take AI</Button>
        <Button size="lg" variant="ghost" onClick={() => { actions.updateQuestion(cur.id, { used: true }); setFu([]); }}><Check /> Tandai dipakai</Button>
      </div>
      <WaitingQueue kind="hottake" />
      <AudienceHistory gimmick="hottake" />
    </Panel>
  );
}

/* ---------------- CONFESSION ---------------- */
const CONF_CATS = ["Funny", "Embarrassing", "Friendship", "School", "Habits", "Everyday"];
export function ConfessionGimmick() {
  const all = useKyoka((s) => s.questions);
  const pool = all.filter((q) => q.gimmick === "confession" && q.category !== VIEWER_CATEGORY);
  const viewerPool = all.filter((q) => q.gimmick === "confession" && q.category === VIEWER_CATEGORY && !q.used);
  const [i, setI] = useState(0);
  const [cat, setCat] = useState("Funny");
  const [custom, setCustom] = useState("");
  const [fu, setFu] = useState<string[]>([]);
  const ai = useAi();
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
        <Button size="lg" variant="secondary" disabled={ai.loading || !cur} onClick={async () => { if (!cur) return; const l = await ai.run({ task: "followup", text: cur.text }); if (l) setFu(l.slice(0, 3)); }}><Sparkles /> Follow-up AI</Button>
        <Button size="lg" variant="ghost" disabled={ai.loading} onClick={async () => { const l = await ai.run({ task: "generate", gimmick: "confession", category: cat, count: 5 }); if (l) { actions.addQuestions(l.map((text) => ({ text, gimmick: "confession", category: cat }))); setI(0); toast.success("Prompt baru masuk"); } }}>{ai.loading ? <Loader2 className="animate-spin" /> : "+"} Prompt AI</Button>
      </div>
      <div className="flex gap-2">
        <Input placeholder="Prompt confession sendiri…" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button onClick={() => { if (actions.addQuestions([{ text: custom, gimmick: "confession", category: cat }])) { setCustom(""); setI(0); } }}><Plus /></Button>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
        <h4 className="text-sm font-bold">🤫 Confession dari penonton ({viewerPool.length} belum dibacakan)</h4>
        {!viewerPool.length && <p className="text-xs text-muted-foreground">Belum ada. Di Inbox penonton, pilih “Confession Time” lalu tekan Simpan ke Bank.</p>}
        <ul className="max-h-64 space-y-2 overflow-auto">
          {viewerPool.map((q) => (
            <li key={q.id} className="rounded-lg bg-card p-3 text-sm">
              <p>{q.text}</p>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="live" onClick={() => sendToOverlay({ gimmick: "audience", kind: "confession", content: q.text })}><Send /> Tampilkan</Button>
                <Button size="sm" variant="ghost" onClick={() => actions.updateQuestion(q.id, { used: true })}><Check /> Sudah dibacakan</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Tip: jangan minta penonton membagikan info pribadi yang sensitif.</p>
      <WaitingQueue kind="confession" />
      <AudienceHistory gimmick="confession" />
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
  const viewerProblems = useKyoka((st) => st.questions).filter((q) => q.gimmick === "chaos" && q.category === VIEWER_CATEGORY && !q.used);
  const ai = useAi();
  // Kalau cerita 3 kata sedang tayang di overlay, mengacak kata juga digulirkan di overlay (in-place), lalu berhenti di kata baru.
  const isStoryLive = () => { const c = readOverlay().payload; return c?.gimmick === "chaos" && c.mode === "story"; };
  const overlayWords = () => { const c = readOverlay().payload; return c?.gimmick === "chaos" && c.mode === "story" ? c.words : []; };
  const rollStart = () => { if (isStoryLive()) updateOverlayPayload({ gimmick: "chaos", mode: "story", words: overlayWords(), rolling: true }); return Date.now(); };
  const rollStop = (final: string[], t0: number) => {
    setTimeout(() => { if (isStoryLive()) updateOverlayPayload({ gimmick: "chaos", mode: "story", words: final, rolling: false }); }, Math.max(0, 1100 - (Date.now() - t0)));
  };
  const shuffleWords = () => { const next = sample(DEMO.words, 3); setWords(next); const t0 = rollStart(); rollStop(next, t0); };
  const aiWords = async () => {
    const t0 = rollStart();
    const l = await ai.run({ task: "words", gimmick: "chaos" });
    const next = l && l.length >= 3 ? l.slice(0, 3) : null;
    if (next) setWords(next);
    rollStop(next ?? overlayWords(), t0);
  };
  const aiProblem = async (given = "") => {
    const l = await ai.run({ task: "problem", gimmick: "chaos", text: given });
    if (l && l.length >= 2) { setProblem(given || l[0]!); setSols(l.slice(1, 4)); }
  };
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
            <Button size="lg" variant="secondary" onClick={shuffleWords}><Shuffle /> Acak</Button>
            <Button size="lg" variant="secondary" disabled={ai.loading} onClick={aiWords}>{ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Kata AI</Button>
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
            <Button size="lg" variant="secondary" disabled={ai.loading} onClick={() => aiProblem()}>{ai.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Masalah AI</Button>
            <Button size="lg" variant="ghost" disabled={ai.loading} onClick={() => aiProblem(problem)}>Solusi AI lain</Button>
          </div>
          {viewerProblems.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
              <h4 className="text-sm font-bold">🙋 Masalah dari penonton ({viewerProblems.length})</h4>
              <ul className="max-h-56 space-y-2 overflow-auto">
                {viewerProblems.map((q) => (
                  <li key={q.id} className="flex items-start gap-2 rounded-lg bg-card p-3 text-sm">
                    <span className="min-w-0 flex-1 break-words">{q.text}</span>
                    <Button size="sm" variant="secondary" disabled={ai.loading} onClick={() => { setProblem(q.text); setSols(sample(DEMO.solutions, 3)); actions.updateQuestion(q.id, { used: true }); void aiProblem(q.text); }}>Pakai</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="Masalah dari penonton…" value={audience} onChange={(e) => setAudience(e.target.value)} />
            <Button disabled={ai.loading} onClick={() => { if (audience) { aiProblem(audience); setAudience(""); } }}>Pakai + AI</Button>
          </div>
        </>
      )}
      <AudienceHistory gimmick="chaos" />
    </Panel>
  );
}

export const GIMMICK_COMPONENTS: Record<GimmickId, () => React.ReactElement> = {
  spin: SpinGimmick, thisorthat: ThisOrThatGimmick, card: CardGimmick, hottake: HotTakeGimmick, confession: ConfessionGimmick, chaos: ChaosGimmick,
};

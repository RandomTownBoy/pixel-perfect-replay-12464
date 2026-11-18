import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ListChecks, Pencil, Plus, RotateCcw, Settings2, Shuffle, Trash2, Tv, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AudienceHistory, ConfirmDelete } from "@/components/AudienceHistory";
import { actions, readOverlay, sendToOverlay, shuffle, subscribeOverlay, updateOverlayPayload, useKyoka, hasRemote, type CardPayload, type OverlayPayload } from "@/lib/kyoka";
import { liveActions, useLive, type Submission } from "@/lib/cloud";
import {
  buildDecks, DECK_SIZE, forgetLock, forgetOrder, freeDeckName, getLockedDecks, isViewerDeck, loadOrder, loadSelectedDeck, lockDeck,
  nextPlayableDeck, pickViewerDeck, planDeckMoves, saveOrder, saveSelectedDeck, type Deck,
} from "@/lib/decks";

const SHUFFLE_MS = 1200;
const AUTO_DEAL_MS = 6000;
const AUTO_DEAL_KEY = "kyoka.card.autoDeal";

const GLYPH = { new: "○", partial: "◐", done: "●" } as const;
const usedIdx = (cards: { used: boolean }[]) => cards.flatMap((c, i) => (c.used ? [i] : []));

function useOverlayPayload(): OverlayPayload | null {
  const [p, setP] = useState<OverlayPayload | null>(null);
  useEffect(() => {
    setP(readOverlay().payload);
    return subscribeOverlay((s) => setP(s.payload));
  }, []);
  return p;
}
const isCardLive = () => { const c = readOverlay().payload; return c?.gimmick === "card" && c.phase !== undefined; };
const standbyOf = (d: Deck): CardPayload => ({ gimmick: "card", phase: "standby", count: d.cards.length, opened: usedIdx(d.cards) });

/* ---------------- PICK A CARD (deck) ---------------- */
export function CardGimmick() {
  const all = useKyoka((s) => s.questions);
  const intake = useLive((s) => s.intake.card);
  const inbox = useLive((s) => s.inbox);
  const pending = useMemo(() => inbox.filter((s) => s.kind === "card"), [inbox]);
  const autoApprove = useKyoka((st) => st.settings.autoApproveCards);

  const [orderMap, setOrderMap] = useState<Record<string, string[]>>({});
  const [lockTick, setLockTick] = useState(0);
  const [selName, setSelName] = useState<string | null>(null);
  const [autoDeal, setAutoDeal] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  // Urutan kartu, deck terpilih, dan pilihan "lanjut otomatis" disimpan di browser supaya refresh di tengah live tidak memutus dashboard dari overlay.
  useEffect(() => {
    setOrderMap(loadOrder());
    setSelName(loadSelectedDeck());
    try { setAutoDeal(localStorage.getItem(AUTO_DEAL_KEY) === "1"); } catch { /* abaikan */ }
    setRestored(true);
  }, []);
  const toggleAuto = (v: boolean) => { setAutoDeal(v); try { localStorage.setItem(AUTO_DEAL_KEY, v ? "1" : "0"); } catch { /* abaikan */ } };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locked = useMemo(() => getLockedDecks(), [all, lockTick]);
  const decks = useMemo(() => buildDecks(all, orderMap, locked), [all, orderMap, locked]);
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const cur = decks.find((d) => d.name === selName) ?? decks.find((d) => d.status !== "done") ?? decks[0];
  useEffect(() => { if (restored && cur) saveSelectedDeck(cur.name); }, [restored, cur?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rapikan data lama: pack > 6 kartu dipecah per 6, "Dari Penonton" jadi deck "Penonton #n". Hanya mengubah kolom kategori.
  useEffect(() => {
    if (!hasRemote()) return;
    const moves = planDeckMoves(all, getLockedDecks());
    if (!moves.length) return;
    moves.forEach((m) => actions.updateQuestion(m.id, { category: m.category }));
    toast(`${moves.length} kartu dirapikan ke deck (maks. ${DECK_SIZE} per deck)`);
  }, [all]);

  const ov = useOverlayPayload();
  const lockViewer = (d: Deck) => { if (d.viewer) { lockDeck(d.name); setLockTick((t) => t + 1); } };

  /** Tampilkan deck di overlay. Deck penonton dikunci dari perubahan overlay, tetapi tetap bisa diisi sampai 6 kartu. */
  const showDeck = (d: Deck) => {
    if (!d.total) { toast("Deck ini belum punya kartu"); return; }
    lockViewer(d);
    sendToOverlay(standbyOf(d));
  };
  const select = (d: Deck) => {
    setSelName(d.name);
    if (isCardLive() && d.total) { lockViewer(d); updateOverlayPayload(standbyOf(d)); }
  };
  /** Acak urutan kartu di dalam deck yang sama (tidak mengambil dari deck lain). */
  const shuffleDeck = (d: Deck) => {
    if (d.total < 2) return;
    const ids = shuffle(d.cards.map((c) => c.id));
    saveOrder(d.name, ids);
    setOrderMap((m) => ({ ...m, [d.name]: ids }));
    const byId = new Map(d.cards.map((c) => [c.id, c]));
    const opened = ids.flatMap((id, i) => (byId.get(id)?.used ? [i] : []));
    if (!isCardLive()) return;
    lockViewer(d);
    updateOverlayPayload({ gimmick: "card", phase: "shuffling", count: ids.length, opened });
    setTimeout(() => {
      const c = readOverlay().payload;
      if (c?.gimmick === "card" && c.phase === "shuffling") updateOverlayPayload({ gimmick: "card", phase: "dealt", count: ids.length, opened });
    }, SHUFFLE_MS);
  };
  const pick = (d: Deck, i: number) => {
    const c = d.cards[i];
    if (!c || d.status === "done") return;
    lockViewer(d);
    if (!c.used) actions.updateQuestion(c.id, { used: true }); // tanda terpakai bertahan walau database memuat ulang
    const opened = [...new Set([...usedIdx(d.cards), i])];
    const payload: CardPayload = { gimmick: "card", phase: "revealed", count: d.cards.length, revealed: i, opened, text: c.text };
    if (isCardLive()) updateOverlayPayload(payload); else sendToOverlay(payload);
  };
  /** Mainkan ulang satu deck: hanya tanda terpakai deck ini yang direset. */
  const replay = (d: Deck) => {
    d.cards.filter((c) => c.used).forEach((c) => actions.updateQuestion(c.id, { used: false }));
    if (isCardLive() && d.name === cur?.name) updateOverlayPayload({ gimmick: "card", phase: "standby", count: d.cards.length, opened: [] });
    toast.success(`Deck ${d.name} bisa dimainkan lagi`);
  };

  const nextDeck = cur?.status === "done" ? nextPlayableDeck(decks, cur.name) : undefined;
  const goNext = (d: Deck) => {
    const ids = shuffle(d.cards.map((c) => c.id));
    saveOrder(d.name, ids);
    setOrderMap((m) => ({ ...m, [d.name]: ids }));
    setSelName(d.name);
    lockViewer(d);
    const next: Deck = { ...d, cards: ids.flatMap((id) => d.cards.filter((c) => c.id === id)) };
    sendToOverlay(standbyOf(next));
  };
  // Lanjut otomatis: deck selesai, overlay masih menayangkan kartu → deck berikutnya dikocok dan ditampilkan.
  useEffect(() => {
    if (!autoDeal || !cur || cur.status !== "done") return;
    const name = cur.name;
    const t = setTimeout(() => {
      if (!isCardLive()) return;
      const nx = nextPlayableDeck(decksRef.current, name);
      if (nx) goNext(nx);
    }, AUTO_DEAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDeal, cur?.name, cur?.status]);
  // Kartu ditambah/dihapus sebelum dipilih: jumlah kartu di overlay (saat standby) ikut diperbarui in-place.
  useEffect(() => {
    const c = readOverlay().payload;
    if (cur && c?.gimmick === "card" && c.phase === "standby" && c.count !== cur.cards.length) updateOverlayPayload(standbyOf(cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.cards.length, ov]);

  return (
    <div className="min-w-0 space-y-6 break-words rounded-2xl border border-border/80 bg-gradient-to-br from-panel via-panel to-primary/[0.06] p-4 shadow-xl shadow-black/10 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Deck aktif</span>
            {cur && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cur.status === "done" ? "bg-success/15 text-success" : "bg-primary/10 text-primary"}`}>{cur.status === "done" ? "Selesai" : cur.status === "partial" ? "Sedang dimainkan" : "Siap dimainkan"}</span>}
            {pending.length > 0 && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-400">{pending.length} menunggu persetujuan</span>}
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <select
                value={cur?.name ?? ""}
                onChange={(e) => { const d = decks.find((x) => x.name === e.target.value); if (d) select(d); }}
                aria-label="Pilih deck aktif"
                className="h-12 w-full appearance-none rounded-xl border border-primary/25 bg-background/80 py-2 pl-4 pr-11 text-sm font-semibold text-foreground shadow-inner outline-none transition hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {!decks.length && <option value="">Belum ada deck</option>}
                {decks.map((d) => {
                  const count = d.status === "done" ? "selesai" : `${d.used}/${d.total} dibuka`;
                  return <option key={d.name} value={d.name}>{d.viewer ? "👥 " : `${GLYPH[d.status]} `}{d.name} · {count}</option>;
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{decks.length} deck tersedia · pilih deck dari daftar</span>
          </div>
          {cur && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{cur.total}</strong> kartu</span>
              <span><strong className="text-foreground">{cur.used}</strong> sudah dibuka</span>
              <span><strong className="text-foreground">{Math.max(0, cur.total - cur.used)}</strong> tersisa</span>
              {cur.viewer && <span>{cur.locked ? "Deck penonton terkunci" : "Menerima kartu penonton"}</span>}
              {nextDeck && <span className="text-primary">Berikutnya: {nextDeck.name}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end xl:self-center">
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" aria-label="Pengaturan kartu" title="Pengaturan kartu"><Settings2 /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <SettingRow label="Terima kartu penonton" checked={intake} onChange={(v) => void liveActions.setIntake("card", v)} />
              <SettingRow label="Setujui otomatis" hint="Kartu penonton lolos filter langsung masuk deck penonton. Mati = ditahan di Kelola sampai kamu setujui." checked={autoApprove}
                onChange={(v) => { actions.updateSettings({ autoApproveCards: v }); if (v && pending.length) void approveAll(pending); }} />
              <SettingRow label="Kocok & lanjut otomatis" hint="Setelah deck selesai, deck berikutnya dikocok dan tampil di overlay." checked={autoDeal} onChange={toggleAuto} />
            </PopoverContent>
          </Popover>
          <Button variant="secondary" onClick={() => setManageOpen(true)} className="relative h-10 rounded-xl px-4"><Layers /> Kelola deck{pending.length > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{pending.length}</span>}</Button>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      {cur ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {cur.cards.map((c, i) => (
              <button key={c.id} className="flip-card group aspect-[3/4] min-w-0 rounded-2xl transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:hover:translate-y-0" disabled={cur.status === "done"} onClick={() => pick(cur, i)} aria-label={`Kartu ${i + 1}${c.used ? " (sudah dibuka)" : ""}`}>
                <div className={`flip-inner h-full w-full ${c.used ? "flipped" : ""}`}>
                  <div className="flip-face flex items-center justify-center rounded-2xl border border-primary/40 bg-gradient-to-br from-primary via-pop to-electric font-display text-2xl font-black text-white shadow-lg shadow-primary/20 transition group-hover:brightness-110">{i + 1}</div>
                  <div className={`flip-face flip-back flex items-center justify-center rounded-2xl border border-border/70 bg-card p-3 text-xs font-semibold leading-tight shadow-inner ${cur.status === "done" ? "opacity-60" : ""}`}>{c.text}</div>
                </div>
              </button>
            ))}
          </div>
          {cur.status === "done" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/40 bg-success/10 p-3">
              <p className="text-sm font-semibold">✅ {cur.name} selesai.{autoDeal && nextDeck ? ` Lanjut otomatis dalam ${AUTO_DEAL_MS / 1000} detik.` : ""}</p>
              <div className="flex flex-wrap gap-2">
                {nextDeck && <Button variant="live" onClick={() => goNext(nextDeck)}>Lanjut ke {nextDeck.name} <ArrowRight /></Button>}
                <Button variant="secondary" onClick={() => replay(cur)}><RotateCcw /> Mainkan ulang deck ini</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" variant="live" onClick={() => showDeck(cur)} disabled={!cur.total}><Tv /> Tampilkan di Overlay</Button>
              <Button variant="ghost" onClick={() => shuffleDeck(cur)} disabled={cur.total < 2} title="Acak posisi kartu di deck ini saja"><Shuffle /> Kocok urutan</Button>
              {cur.viewer && cur.total < DECK_SIZE && <span className="text-xs text-muted-foreground">Deck ini tetap menerima kartu sampai {DECK_SIZE}/6; kartu baru tidak mengubah overlay yang sedang tayang.</span>}
            </div>
          )}
        </>
      ) : null}

      <DeckManager open={manageOpen} onOpenChange={setManageOpen} decks={decks} cur={cur} pending={pending} locked={locked}
        onSelect={(name) => { setSelName(name); const d = decksRef.current.find((x) => x.name === name); if (d && isCardLive() && d.total) updateOverlayPayload(standbyOf(d)); }}
        onReplay={replay}
        onDeckGone={(name) => { forgetOrder(name); forgetLock(name); setOrderMap(loadOrder()); setLockTick((t) => t + 1); }}
        onRenamed={(from, to) => { const o = loadOrder(); if (o[from]) saveOrder(to, o[from]); forgetOrder(from); setOrderMap(loadOrder()); setSelName(to); }} />
    </div>
  );
}

function SettingRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm" title={hint}>
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

async function approveAll(list: Submission[]) {
  let ok = 0;
  for (const s of list) { if ((await liveActions.saveToBank(s)).ok) ok++; }
  toast.success(`${ok} kartu penonton disetujui`);
}

/* ---------------- Kelola deck (drawer) ---------------- */
type Pending = Submission[];

function DeckManager({ open, onOpenChange, decks, cur, pending, locked, onSelect, onReplay, onDeckGone, onRenamed }: {
  open: boolean; onOpenChange: (v: boolean) => void; decks: Deck[]; cur: Deck | undefined;
  pending: Pending; locked: ReadonlySet<string>;
  onSelect: (name: string) => void; onReplay: (d: Deck) => void; onDeckGone: (name: string) => void; onRenamed: (from: string, to: string) => void;
}) {
  const all = useKyoka((s) => s.questions);
  const [viewName, setViewName] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [newCard, setNewCard] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [nd, setNd] = useState({ name: "", card: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { if (open) { setViewName(cur?.name ?? null); setRename(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = decks.find((d) => d.name === viewName) ?? cur;
  const cardOf = (id: string) => all.find((q) => q.id === id && q.gimmick === "card");
  const chosen = selected.map(cardOf).filter((q): q is NonNullable<typeof q> => !!q);
  const toggle = (id: string) => setSelected((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const clearSel = () => { setSelected([]); setSelectMode(false); };
  const nameTaken = (n: string, except?: string) => decks.some((d) => d.name.toLowerCase() === n.toLowerCase() && d.name !== except);

  const addCard = () => {
    if (!view) return;
    if (view.total >= DECK_SIZE) { toast(`Deck penuh (maks. ${DECK_SIZE} kartu)`); return; }
    if (actions.addQuestions([{ text: newCard, gimmick: "card", category: view.name }])) setNewCard(""); else toast("Kartu kosong atau sudah ada");
  };
  const makeNewDeck = () => {
    if (!chosen.length) return;
    if (chosen.length > DECK_SIZE) { toast(`Maksimal ${DECK_SIZE} kartu per deck. Kurangi pilihanmu.`); return; }
    const name = freeDeckName(all);
    chosen.forEach((q) => actions.updateQuestion(q.id, { category: name })); // dipindah, bukan disalin
    toast.success(`${chosen.length} kartu dipindah ke ${name}`);
    clearSel(); setViewName(name); onSelect(name);
  };
  const moveChosen = () => {
    const target = decks.find((d) => d.name === moveTo);
    if (!target || !chosen.length) return;
    const incoming = chosen.filter((q) => q.category !== target.name);
    if (target.total + incoming.length > DECK_SIZE) { toast(`${target.name} hanya muat ${DECK_SIZE - target.total} kartu lagi`); return; }
    incoming.forEach((q) => actions.updateQuestion(q.id, { category: target.name }));
    toast.success(`${incoming.length} kartu dipindah ke ${target.name}`);
    clearSel(); setMoveTo("");
  };
  const deleteChosen = () => { chosen.forEach((q) => actions.deleteQuestion(q.id)); toast.success(`${chosen.length} kartu dihapus`); clearSel(); };
  const restoreChosen = () => { chosen.filter((q) => q.used).forEach((q) => actions.updateQuestion(q.id, { used: false })); toast.success("Kartu pilihan bisa dipakai lagi"); clearSel(); };

  const doRename = () => {
    if (!view || rename === null) return;
    const to = rename.trim();
    if (!to || to === view.name) { setRename(null); return; }
    if (nameTaken(to, view.name)) { toast("Nama deck itu sudah dipakai"); return; }
    if (isViewerDeck(to) && !view.viewer) { toast("Nama “Penonton #…” dipakai untuk deck penonton"); return; }
    view.cards.forEach((c) => actions.updateQuestion(c.id, { category: to }));
    onRenamed(view.name, to); setViewName(to); setRename(null);
    toast.success(`Deck diganti nama menjadi ${to}`);
  };
  const deleteDeck = () => {
    if (!view) return;
    view.cards.forEach((c) => actions.deleteQuestion(c.id));
    onDeckGone(view.name); setViewName(null); setSelected((l) => l.filter((id) => !view.cards.some((c) => c.id === id)));
    toast.success(`Deck ${view.name} dihapus`);
  };
  const createDeck = () => {
    const name = nd.name.trim();
    if (!name || !nd.card.trim()) { toast("Isi nama deck dan satu kartu pertama"); return; }
    if (nameTaken(name)) { toast("Nama deck itu sudah dipakai"); return; }
    if (isViewerDeck(name)) { toast("Nama “Penonton #…” dipakai untuk deck penonton"); return; }
    if (!actions.addQuestions([{ text: nd.card, gimmick: "card", category: name }])) { toast("Kartu sudah ada di Question Bank"); return; }
    setNd({ name: "", card: "" }); setViewName(name); onSelect(name);
  };

  const approve = async (s: Pending[number]) => {
    setSaving(s.id);
    try { const r = await liveActions.saveToBank(s); if (r.ok) toast.success(r.message); else toast.error(r.message); } finally { setSaving(null); }
  };
  const approveEvery = async () => { setSaving("all"); try { await approveAll(pending); } finally { setSaving(null); } };
  const nextViewer = pickViewerDeck(all, locked);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full space-y-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kelola deck</SheetTitle>
          <SheetDescription>Maks. {DECK_SIZE} kartu per deck. Kartu yang dipindah tidak ada di dua deck.</SheetDescription>
        </SheetHeader>

        {pending.length > 0 && (
          <section className="space-y-2 rounded-xl border border-primary/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">⏳ Menunggu persetujuan ({pending.length})</h3>
              {pending.length > 1 && <Button size="sm" variant="secondary" disabled={saving !== null} onClick={() => void approveEvery()}><Check /> {saving === "all" ? "Menyetujui…" : "Setujui semua"}</Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">Kartu yang disetujui masuk ke {nextViewer}.</p>
            <ul className="space-y-2">
              {pending.map((s) => (
                <li key={s.id} className="space-y-2 rounded-lg border border-border p-2.5">
                  <p className="break-words text-sm">{s.content}</p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={saving !== null} onClick={() => void approve(s)}><Plus />{saving === s.id ? "Menyimpan…" : "Setujui"}</Button>
                    <Button size="sm" variant="ghost" aria-label="Tolak kartu" onClick={() => void liveActions.setStatus(s.id, "rejected")}><Trash2 /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <select value={view?.name ?? ""} onChange={(e) => { setViewName(e.target.value); setRename(null); }} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm">
              {!decks.length && <option value="">Belum ada deck</option>}
              {decks.map((d) => <option key={d.name} value={d.name}>{GLYPH[d.status]} {d.name} ({d.used}/{d.total})</option>)}
            </select>
            <Button size="sm" variant={selectMode ? "secondary" : "ghost"} onClick={() => (selectMode ? clearSel() : setSelectMode(true))}><ListChecks /> {selectMode ? "Selesai" : "Pilih"}</Button>
          </div>

          {view && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {rename === null ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setRename(view.name)}><Pencil /> Ganti nama</Button>
                    {view.used > 0 && <Button size="sm" variant="secondary" onClick={() => onReplay(view)}><RotateCcw /> Mainkan ulang deck ini</Button>}
                    <ConfirmDelete label="Hapus deck" confirmLabel={`Yakin hapus ${view.total} kartu?`} onConfirm={deleteDeck} />
                  </>
                ) : (
                  <div className="flex w-full gap-1">
                    <Input value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doRename(); }} aria-label="Nama deck" />
                    <Button size="icon" onClick={doRename} aria-label="Simpan nama"><Check /></Button>
                  </div>
                )}
              </div>

              {selectMode && (
                <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-2.5">
                  <p className="text-xs font-semibold">{chosen.length} kartu dipilih (dari deck mana saja)</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="live" disabled={!chosen.length} onClick={makeNewDeck}><Layers /> Jadikan deck baru</Button>
                    <Button size="sm" variant="secondary" disabled={!chosen.some((q) => q.used)} onClick={restoreChosen}><RotateCcw /> Pakai lagi</Button>
                    {chosen.length > 0 && <ConfirmDelete label="Hapus" confirmLabel={`Yakin hapus ${chosen.length}?`} onConfirm={deleteChosen} />}
                  </div>
                  <div className="flex gap-1.5">
                    <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm" aria-label="Pindahkan ke deck">
                      <option value="">Pindahkan ke…</option>
                      {decks.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.total}/{DECK_SIZE})</option>)}
                    </select>
                    <Button size="sm" variant="secondary" disabled={!chosen.length || !moveTo} onClick={moveChosen}>Pindah</Button>
                  </div>
                </div>
              )}

              <ul className="space-y-1.5">
                {view.cards.map((q) => (
                  <li key={q.id} className={`flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-2.5 text-sm ${q.used ? "opacity-60" : ""}`}>
                    {selectMode && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} aria-label="Pilih kartu" />}
                    <div className="min-w-0 flex-1">
                      {editing?.id === q.id ? (
                        <div className="flex gap-1">
                          <Input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { actions.updateQuestion(q.id, { text: editing.text }); setEditing(null); } }} />
                          <Button size="icon" aria-label="Simpan kartu" onClick={() => { actions.updateQuestion(q.id, { text: editing.text }); setEditing(null); }}><Check /></Button>
                        </div>
                      ) : <p className="cursor-text break-words" onClick={() => setEditing({ id: q.id, text: q.text })} title="Klik untuk mengedit">{q.text}</p>}
                      <p className="text-[11px] text-muted-foreground">{q.used ? "sudah dibuka" : "belum dibuka"}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 px-0" title={q.used ? "Pakai lagi" : "Tandai terpakai"} aria-label={q.used ? "Pakai lagi" : "Tandai terpakai"} onClick={() => actions.updateQuestion(q.id, { used: !q.used })}>{q.used ? <RotateCcw /> : <Check />}</Button>
                    <ConfirmDelete compact label="Hapus kartu" confirmLabel="Hapus?" className="h-8 shrink-0 px-2" onConfirm={() => { actions.deleteQuestion(q.id); setSelected((l) => l.filter((x) => x !== q.id)); }} />
                  </li>
                ))}
                {!view.cards.length && <p className="text-sm text-muted-foreground">Deck ini kosong.</p>}
              </ul>
              <div className="flex gap-2">
                <Input placeholder={view.total >= DECK_SIZE ? "Deck penuh" : `Tambah kartu ke ${view.name}…`} disabled={view.total >= DECK_SIZE} value={newCard} onChange={(e) => setNewCard(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCard(); }} />
                <Button onClick={addCard} disabled={view.total >= DECK_SIZE} aria-label="Tambah kartu"><Plus /></Button>
              </div>
            </>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-bold">Buat deck baru</h3>
          <Input placeholder="Nama deck" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="Kartu pertama" value={nd.card} onChange={(e) => setNd({ ...nd, card: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") createDeck(); }} />
            <Button onClick={createDeck} aria-label="Buat deck"><Plus /></Button>
          </div>
        </section>

        <section className="border-t border-border pt-3">
          <button onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen} className="flex w-full items-center justify-between text-left text-sm font-semibold">
            <span>🕘 Riwayat dari penonton</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && <AudienceHistory gimmick="card" />}
        </section>
      </SheetContent>
    </Sheet>
  );
}

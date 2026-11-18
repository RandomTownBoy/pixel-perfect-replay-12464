import { ListFilter, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { liveActions, onAirGimmick, queueGimmickOf, useLive, waitingOf, waitingOrder, type Submission } from "@/lib/cloud";

const LABEL: Record<string, string> = { confession: "🤫 Confession", hottake: "🔥 Hot Take", thisorthat: "⚡ This or That", chaos: "🎲 Random Chaos" };
const body = (s: Submission) => (s.kind === "thisorthat" ? (s.content ?? "").replace(" | ", "  ⚔  ") : s.content ?? "");
const KINDS = ["hottake", "confession", "thisorthat", "chaos"] as const;

/** Pengelolaan antrean dibuka sesuai kebutuhan agar halaman Gimmicks tetap ringkas. */
export function QueueManager() {
  const [open, setOpen] = useState(false);
  const inbox = useLive((l) => l.inbox);
  const queue = useLive((l) => l.queue);
  const nowShowing = useLive((l) => l.nowShowing);
  const modes = useLive((l) => l.queueModes);
  const activeKind = nowShowing ? queueGimmickOf(nowShowing.kind) : null;
  const activeGimmick = onAirGimmick();
  const totalWaiting = KINDS.reduce((total, kind) => total + waitingOf({ inbox, queue, nowShowing }, kind).length + queue.filter((item) => queueGimmickOf(item.kind) === kind).length, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-2 px-3">
          <ListFilter className="h-4 w-4" />
          <span>Antrean</span>
          {totalWaiting > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{totalWaiting}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pr-8">
          <SheetTitle>Pengelolaan Antrean</SheetTitle>
          <SheetDescription>Kelola kiriman penonton tanpa memenuhi halaman Gimmicks.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Sedang ditampilkan</span>
            <span className="font-semibold">{activeKind ? LABEL[activeKind] ?? activeKind : "Tidak ada"}</span>
          </div>
          {KINDS.map((kind) => {
            const waiting = waitingOrder(waitingOf({ inbox, queue, nowShowing }, kind));
            const queued = queue.filter((item) => queueGimmickOf(item.kind) === kind).length;
            const playing = !!nowShowing && queueGimmickOf(nowShowing.kind) === kind;
            const mode = modes[kind] ?? "auto";
            const heldByOther = !!activeGimmick && activeGimmick !== kind;
            return (
              <section key={kind} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{LABEL[kind]}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${playing ? "bg-emerald-500/15 text-emerald-500" : heldByOther && waiting.length ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground"}`}>
                    {playing ? "Berjalan" : waiting.length && heldByOther ? "Tertahan" : waiting.length ? "Menunggu" : "Kosong"}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{waiting.length + queued} menunggu{playing ? " · 1 tampil" : ""}</span>
                  <Button size="sm" variant="live" className="h-8 px-2.5" disabled={!waiting.length} onClick={() => liveActions.playWaiting(kind)}><Play className="h-3.5 w-3.5" /> Jalankan</Button>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-medium">Lanjut otomatis</p>
                    <p className="text-[10px] text-muted-foreground">{mode === "auto" ? "Input baru lanjut saat sesi menunggu" : "Input baru menunggu perintah host"}</p>
                  </div>
                  <Switch checked={mode === "auto"} onCheckedChange={(value) => liveActions.setQueueMode(kind, value ? "auto" : "manual")} aria-label={`Lanjut otomatis ${LABEL[kind]}`} />
                </div>
                {waiting.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    {waiting.slice(0, 4).map((item, index) => <li key={item.id} className="truncate">{index + 1}. {body(item)}</li>)}
                    {waiting.length > 4 && <li>+{waiting.length - 4} kiriman lainnya</li>}
                  </ul>
                )}
                {!waiting.length && !playing && <p className="mt-2 text-[11px] text-muted-foreground">Belum ada kiriman yang menunggu.</p>}
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Daftar tunggu per gimmick; dipertahankan di dalam panel gimmick masing-masing. */
export function WaitingQueue({ kind, compact = false }: { kind: string; compact?: boolean }) {
  const inbox = useLive((l) => l.inbox);
  const queue = useLive((l) => l.queue);
  const nowShowing = useLive((l) => l.nowShowing);
  const mode = useLive((l) => l.queueModes[kind] ?? "auto");
  const waiting = waitingOrder(waitingOf({ inbox, queue, nowShowing }, kind));
  const playing = !!nowShowing && queueGimmickOf(nowShowing.kind) === kind;
  const left = playing ? queue.filter((q) => queueGimmickOf(q.kind) === queueGimmickOf(kind)).length : 0;
  if (!LABEL[kind]) return null;
  if (compact && !waiting.length && !playing) return null;
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs">{LABEL[kind]} · <b>{waiting.length}</b> menunggu{playing ? ` · ▶ sisa ${left}` : ""}</span>
        <Button size="sm" variant="live" className="h-7 shrink-0 px-2 text-xs" disabled={!waiting.length} onClick={() => liveActions.playWaiting(kind)}><Play /> Putar</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold">⏳ {LABEL[kind]} menunggu giliran: {waiting.length}</p>
        <Button size="sm" variant="live" disabled={!waiting.length} onClick={() => liveActions.playWaiting(kind)}><Play /> Jalankan antrean ({waiting.length})</Button>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-xs text-muted-foreground">Lanjut otomatis</span>
        <Switch checked={mode === "auto"} onCheckedChange={(v) => liveActions.setQueueMode(kind, v ? "auto" : "manual")} aria-label={`Lanjut otomatis ${LABEL[kind]}`} />
      </div>
      {playing && <p className="text-xs text-emerald-500">▶ Sedang diputar · sisa {left} antre</p>}
      {waiting.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {waiting.slice(0, 3).map((s, i) => <li key={s.id} className="truncate">{i + 1}. {body(s)}</li>)}
          {waiting.length > 3 && <li>+{waiting.length - 3} lainnya</li>}
        </ul>
      )}
      {!waiting.length && !playing && <p className="text-xs text-muted-foreground">Belum ada kiriman yang menunggu. Sesi yang sudah dijalankan akan otomatis melanjutkan saat input baru masuk jika mode otomatis aktif.</p>}
    </div>
  );
}

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { liveActions, useLive, waitingOf, waitingOrder, type Submission } from "@/lib/cloud";

const LABEL: Record<string, string> = { confession: "🤫 Confession", hottake: "🔥 Hot Take", thisorthat: "⚡ This or That" };
const body = (s: Submission) => (s.kind === "thisorthat" ? (s.content ?? "").replace(" | ", "  ⚔  ") : s.content ?? "");

/**
 * Daftar tunggu per gimmick: kiriman penonton yang ditahan di Inbox. Satu tombol memutar semuanya berurutan (otomatis, dengan garis loading di overlay).
 * `compact` = versi Inbox: disembunyikan kalau tidak ada yang menunggu.
 */
export function WaitingQueue({ kind, compact = false }: { kind: string; compact?: boolean }) {
  const inbox = useLive((l) => l.inbox);
  const queue = useLive((l) => l.queue);
  const nowShowing = useLive((l) => l.nowShowing);
  const waiting = waitingOrder(waitingOf({ inbox, queue, nowShowing }, kind));
  const playing = nowShowing?.kind === kind;
  const left = playing ? queue.filter((q) => q.kind === kind).length : 0;
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
        <Button size="sm" variant="live" disabled={!waiting.length} onClick={() => liveActions.playWaiting(kind)}><Play /> Tampilkan antrean ({waiting.length})</Button>
      </div>
      {playing && <p className="text-xs text-success">▶ Sedang diputar · sisa {left} antre</p>}
      {waiting.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {waiting.slice(0, 3).map((s, i) => <li key={s.id} className="truncate">{i + 1}. {body(s)}</li>)}
          {waiting.length > 3 && <li>+{waiting.length - 3} lainnya</li>}
        </ul>
      )}
      {!waiting.length && !playing && <p className="text-xs text-muted-foreground">Belum ada yang menunggu. Kiriman penonton untuk gimmick ini ditahan di sini sampai kamu menekan tombol.</p>}
    </div>
  );
}

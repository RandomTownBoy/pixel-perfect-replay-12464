import { useEffect, useState } from "react";
import { BookmarkPlus, ListPlus, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  BANKABLE_KINDS, GIMMICK_KINDS, QUEUE_KINDS, isFast, liveActions, TIER_BADGE, useLive, vipOf, type Submission,
} from "@/lib/cloud";
import { actions, getQuestions, normalize, sendToOverlay, useKyoka, VIEWER_CATEGORY, type GimmickId } from "@/lib/kyoka";

const STATUS_LABEL: Record<string, string> = { approved: "✅ Di Question Bank", shown: "📺 Sudah ditampilkan", rejected: "🚫 Ditolak" };
const FILTERS = [["all", "Semua"], ["shown", "Ditampilkan"], ["approved", "Di Bank"], ["rejected", "Ditolak"]] as const;
const PAGE = 10;

/** "5 mnt lalu", "2 jam lalu", dst. */
export function timeAgo(iso: string, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

/** Tombol hapus dua langkah: ketuk sekali untuk meminta konfirmasi, ketuk lagi untuk menghapus. Otomatis batal kalau tidak dikonfirmasi. */
export function ConfirmDelete({ label, confirmLabel = "Yakin hapus?", onConfirm, className = "", compact = false }: {
  label: string; confirmLabel?: string; onConfirm: () => void | Promise<unknown>; className?: string; compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (compact) {
    return (
      <Button size="sm" variant={armed ? "destructive" : "ghost"} className={className} aria-label={armed ? confirmLabel : label} title={armed ? confirmLabel : label}
        onClick={() => { if (armed) { setArmed(false); void onConfirm(); } else setArmed(true); }}>
        <Trash2 />{armed && <span>{confirmLabel}</span>}
      </Button>
    );
  }
  return (
    <Button size="sm" variant={armed ? "destructive" : "ghost"} className={className}
      onClick={() => { if (armed) { setArmed(false); void onConfirm(); } else setArmed(true); }}>
      <Trash2 /> {armed ? confirmLabel : label}
    </Button>
  );
}

/**
 * Riwayat kiriman penonton untuk satu gimmick: yang sudah ditampilkan, disimpan ke Question Bank, atau ditolak.
 * Dipakai di semua halaman gimmick supaya perilakunya seragam.
 */
export function AudienceHistory({ gimmick }: { gimmick: GimmickId }) {
  const history = useLive((l) => l.history);
  const queue = useLive((l) => l.queue);
  const inbox = useLive((l) => l.inbox);
  const nowShowing = useLive((l) => l.nowShowing);
  const gifters = useLive((l) => l.gifters);
  const questions = useKyoka((s) => s.questions);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [limit, setLimit] = useState(PAGE);
  const [savingId, setSavingId] = useState<string | null>(null);

  const kinds = GIMMICK_KINDS[gimmick];
  const all = history.filter((s) => kinds.includes(s.kind));
  const list = all.filter((s) => filter === "all" || s.status === filter);
  const shownList = list.slice(0, limit);

  const who = (s: Submission) => {
    const b = TIER_BADGE[vipOf(s)];
    const lead = `${isFast(s) ? "⚡ " : ""}${b ? `${b} ` : ""}`;
    const gifter = s.verified_uid ? gifters[s.verified_uid]?.nickname : undefined;
    return s.nickname ? `${lead}@${s.nickname}` : `${lead}Anonim${gifter ? ` (@${gifter} ✓)` : ""}`;
  };
  const body = (s: Submission) => (s.kind === "thisorthat" ? (s.content ?? "").replace(" | ", "  ⚔  ") : s.content);
  const isQueued = (s: Submission) => queue.some((x) => x.id === s.id) || nowShowing?.id === s.id || inbox.some((x) => x.id === s.id && x.status === "pending");
  const isSpinSubmission = (s: Submission) => s.kind === "spin" || s.kind === "question";
  // Sinkron dengan Question Bank: kedua tombol berubah menjadi nonaktif setelah pertanyaan
  // benar-benar masuk ke antrean/roda, termasuk ketika ditambahkan dari tempat lain.
  const isOnSpinWheel = (s: Submission) => isSpinSubmission(s) && questions.some((q) =>
    q.gimmick === "spin" && q.category === VIEWER_CATEGORY && !q.used && normalize(q.text) === normalize(s.content ?? "")
  );

  const save = async (s: Submission) => {
    setSavingId(s.id);
    const r = await liveActions.saveToBank(s);
    setSavingId(null);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
  };

  /** Tampilkan ulang di overlay dengan cara yang sama seperti di Inbox. */
  const replay = (s: Submission) => {
    if (QUEUE_KINDS.has(s.kind)) { liveActions.showNow(s); return; }
    if (s.kind === "thisorthat" || s.kind === "hottake" || s.kind === "chaos") {
      if (!liveActions.startRound(s)) toast.error("Isi kiriman tidak valid untuk dijadikan ronde.");
      return;
    }
    sendToOverlay({ gimmick: "audience", kind: s.kind, content: s.content ?? "", ...(s.nickname ? { nickname: s.nickname } : {}) });
    void liveActions.setStatus(s.id, "shown");
  };
  const requeue = async (s: Submission) => { const ok = await liveActions.enqueue(s); if (!ok) toast.error(s.flagged || s.status === "review" ? "Kiriman perlu disetujui terlebih dahulu." : "Kiriman sudah berada dalam antrean atau tidak dapat diantrekan."); };
  const putBackOnSpin = async (s: Submission) => {
    if (isOnSpinWheel(s)) return;
    const text = (s.content ?? "").trim();
    const existing = getQuestions().find((q) => q.gimmick === "spin" && normalize(q.text) === normalize(text));
    if (existing) {
      actions.updateQuestion(existing.id, { used: false, category: VIEWER_CATEGORY });
      toast.success("Pertanyaan masuk ke antrean Spin 🎡");
      return;
    }
    setSavingId(s.id);
    const result = await liveActions.saveToBank(s, "spin");
    setSavingId(null);
    if (result.ok) toast.success(result.message); else toast.error(result.message);
  };
  const replayLabel = (s: Submission) =>
    QUEUE_KINDS.has(s.kind) ? (isQueued(s) ? "Sedang tayang" : "Tampilkan lagi")
      : s.kind === "chaos" ? "Jadikan cerita" : s.kind === "thisorthat" || s.kind === "hottake" ? "Jadikan ronde" : "Tampilkan lagi";

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">🕘 Riwayat dari penonton ({all.length})</h3>
        {all.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => { setFilter(k); setLimit(PAGE); }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{l}</button>
            ))}
            {list.length > 0 && <ConfirmDelete label={`Hapus ${filter === "all" ? "semua" : "yang tampil"} (${list.length})`} confirmLabel={`Yakin hapus ${list.length}?`} onConfirm={() => liveActions.deleteHistory(list.map((x) => x.id))} className="h-7 px-2 text-[11px]" />}
          </div>
        )}
      </div>
      {!all.length && <p className="text-sm text-muted-foreground">Belum ada riwayat. Kiriman yang ditampilkan, disimpan ke Bank, atau ditolak akan muncul di sini.</p>}
      {all.length > 0 && !list.length && <p className="text-sm text-muted-foreground">Tidak ada kiriman dengan status ini.</p>}
      <ul className="space-y-2">
        {shownList.map((s) => (
          <li key={s.id} className="space-y-1.5 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs font-semibold text-pop">{who(s)} · <span className="text-muted-foreground">{STATUS_LABEL[s.status] ?? s.status} · {timeAgo(s.created_at)}</span></p>
            <p className="break-words text-sm">{body(s)}</p>
            <div className="flex flex-wrap gap-1.5">
              {s.status !== "rejected" && s.kind !== "card" && (
                <Button
                  size="sm"
                  variant="live"
                  disabled={(QUEUE_KINDS.has(s.kind) && isQueued(s)) || isOnSpinWheel(s)}
                  className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55 disabled:shadow-none disabled:hover:brightness-100"
                  onClick={() => replay(s)}
                >
                  <Send /> {replayLabel(s)}
                </Button>
              )}
              {s.status !== "rejected" && isSpinSubmission(s) && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isOnSpinWheel(s) || savingId === s.id}
                  className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55 disabled:shadow-none"
                  onClick={() => void putBackOnSpin(s)}
                >
                  <ListPlus /> {savingId === s.id ? "Memasukkan…" : isOnSpinWheel(s) ? "Sudah masuk Spin" : "Masukkan ke roda"}
                </Button>
              )}
              {s.status !== "rejected" && QUEUE_KINDS.has(s.kind) && (
                <Button size="sm" variant="secondary" disabled={isQueued(s)} onClick={() => void requeue(s)}><ListPlus /> {isQueued(s) ? "Dalam antrean" : "Antrekan lagi"}</Button>
              )}
              {s.status !== "approved" && BANKABLE_KINDS.has(s.kind) && (
                <Button size="sm" variant="secondary" disabled={savingId === s.id} onClick={() => void save(s)}><BookmarkPlus /> {savingId === s.id ? "Menyimpan…" : "Simpan ke Bank"}</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void liveActions.setStatus(s.id, "pending")}><RotateCcw /> Kembalikan ke Inbox</Button>
              <ConfirmDelete compact label="Hapus dari riwayat" confirmLabel="Hapus?" className="ml-auto" onConfirm={() => liveActions.deleteHistory([s.id])} />
            </div>
          </li>
        ))}
      </ul>
      {list.length > limit && <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit(limit + PAGE)}>Tampilkan lebih banyak ({list.length - limit})</Button>}
    </section>
  );
}

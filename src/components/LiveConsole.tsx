import { useState } from "react";
import { BookmarkPlus, Copy, Gift, Inbox, MessageCircle, Radio, RotateCcw, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { liveActions, totalVotes, useLive, type LiveEvent, type Submission } from "@/lib/cloud";
import { readOverlay, sendToOverlay, showBanner, useKyoka } from "@/lib/kyoka";

export function audienceUrl(code: string | null) {
  return typeof window !== "undefined" && code ? `${window.location.origin}/live/${code}` : "";
}

/** Floating control for audience participation: votes, TikTok comment tally, gifts, inbox. */
export function LiveConsole() {
  const [open, setOpen] = useState<"votes" | "gift" | "inbox" | "feed" | null>(null);
  const inbox = useLive((l) => l.inbox);
  const history = useLive((l) => l.history);
  const feed = useLive((l) => l.feed);
  const tk = useLive((l) => l.tiktokLive);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [savingId, setSavingId] = useState<string | null>(null);
  const code = useLive((l) => l.audienceCode);
  const live = useLive((l) => l);
  const totals = totalVotes(live);
  const rules = useKyoka((s) => s.settings.giftRules);
  const [sender, setSender] = useState("");
  const [side, setSide] = useState<"a" | "b">("a");
  const p = readOverlay().payload;
  const voting = p?.gimmick === "thisorthat" || p?.gimmick === "hottake";
  const labels = p?.gimmick === "thisorthat" ? [p.a ?? "A", p.b ?? "B"] : ["Setuju", "Gak setuju"];

  const save = async (s: Submission) => {
    setSavingId(s.id);
    const r = await liveActions.saveToBank(s);
    setSavingId(null);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
  };
  const show = (s: Submission) => sendToOverlay({ gimmick: "audience", kind: s.kind, content: s.content ?? "", nickname: s.nickname ?? undefined });
  const kindLabel = (k: string) => (k === "confession" ? "🤫 Confession" : k === "problem" ? "🌀 Masalah" : "💬 Pertanyaan");
  const statusLabel: Record<string, string> = { approved: "✅ Di Question Bank", shown: "📺 Sudah ditampilkan", rejected: "🚫 Ditolak" };

  const showComment = (e: LiveEvent) => sendToOverlay({ gimmick: "audience", kind: "question", content: e.content ?? "", nickname: e.nickname ?? undefined });
  const feedLine = (e: LiveEvent) => {
    const who = `@${e.nickname || e.user_id || "penonton"}`;
    if (e.type === "gift") return `🎁 ${who} kirim ${e.gift_name ?? "gift"}${e.gift_count > 1 ? ` ×${e.gift_count}` : ""}`;
    if (e.type === "follow") return `➕ ${who} follow`;
    if (e.type === "share") return `🔁 ${who} membagikan LIVE`;
    return `${who}: ${e.content ?? ""}`;
  };

  const applyGift = (id: string) => {
    const r = rules.find((x) => x.id === id); if (!r) return;
    const who = sender.trim() ? `@${sender.trim()}` : "Seseorang";
    if (r.effect === "vote" && voting) {
      liveActions.addGift(side, r.weight, `${r.emoji} ${who} → ${side.toUpperCase()} +${r.weight}`);
      showBanner(`${r.emoji} ${who} kirim ${r.name}! ${side.toUpperCase()} +${r.weight} suara`);
    } else {
      liveActions.logGift(`${r.emoji} ${who}: ${r.reward}`);
      showBanner(`${r.emoji} Makasih ${who} untuk ${r.name}! ${r.reward}`);
    }
    setSender("");
  };

  return (
    <div className="fixed bottom-20 right-3 z-30 flex flex-col items-end gap-2 md:bottom-5 md:right-5">
      {open && (
        <div className="w-[min(92vw,360px)] rounded-2xl border border-border bg-popover p-4 shadow-glow animate-pop-in">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">{open === "votes" ? "Vote Penonton" : open === "gift" ? "Gift TikTok" : open === "feed" ? "Live Feed TikTok" : `Inbox Penonton (${inbox.length})`}</h3>
            <button onClick={() => setOpen(null)} aria-label="Tutup"><X className="h-4 w-4" /></button>
          </div>

          {open === "votes" && (!voting ? (
            <p className="text-sm text-muted-foreground">Kirim <b>This or That</b> atau <b>Hot Take</b> ke overlay untuk mulai voting.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {(["a", "b"] as const).map((s, i) => (
                <div key={s} className="rounded-xl bg-background/60 p-3">
                  <div className="mb-2 flex justify-between font-semibold"><span className="truncate">{s.toUpperCase()} · {labels[i]}</span><span className="font-display">{totals[s]}</span></div>
                  <p className="mb-2 text-xs text-muted-foreground">Web {live.web[s]} · Komen TikTok {live.tiktok[s]} · Gift {live.gift[s]}</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => liveActions.addTiktok(s, 1)}><MessageCircle /> +1</Button>
                    <Button size="sm" variant="secondary" onClick={() => liveActions.addTiktok(s, 5)}>+5</Button>
                    <Button size="sm" variant="secondary" onClick={() => liveActions.addTiktok(s, 10)}>+10</Button>
                    <Button size="sm" variant="ghost" onClick={() => liveActions.addTiktok(s, -1)}>−1</Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Tombol komen = hitung manual komentar “A”/“B” di TikTok. Vote dari link penonton masuk otomatis.</p>
              <Button size="sm" variant="ghost" onClick={liveActions.resetVotes}><RotateCcw /> Reset hitungan</Button>
            </div>
          ))}

          {open === "gift" && (
            <div className="space-y-3 text-sm">
              <Input placeholder="Nama pengirim (opsional)" value={sender} onChange={(e) => setSender(e.target.value)} />
              {voting && (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {(["a", "b"] as const).map((s, i) => <button key={s} onClick={() => setSide(s)} className={`truncate rounded-md py-1.5 text-xs font-semibold ${side === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Dukung {s.toUpperCase()} · {labels[i]}</button>)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {rules.map((r) => (
                  <button key={r.id} onClick={() => applyGift(r.id)} className="rounded-xl border border-border bg-card p-2.5 text-left transition hover:border-pop active:scale-95">
                    <div className="text-xl">{r.emoji}</div>
                    <div className="text-xs font-bold">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.effect === "vote" && voting ? `+${r.weight} suara` : r.reward}</div>
                  </button>
                ))}
              </div>
              {live.giftLog.length > 0 && <ul className="max-h-24 space-y-1 overflow-auto text-xs text-muted-foreground">{live.giftLog.map((g) => <li key={g.id}>{g.text}</li>)}</ul>}
              <p className="text-xs text-muted-foreground">Tap saat gift masuk di TikTok. Atur gift & hadiahnya di Settings.</p>
            </div>
          )}

          {open === "feed" && (
            <div className="space-y-2 text-sm">
              <div className={`flex items-center gap-2 rounded-lg p-2 text-xs font-semibold ${tk.connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-2 w-2 rounded-full ${tk.connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
                {tk.connected ? `Konektor TikTok aktif${tk.handle ? ` · @${tk.handle}` : ""}` : "Konektor TikTok belum aktif — lihat Settings › TikTok LIVE"}
              </div>
              {!feed.length && <p className="py-4 text-center text-muted-foreground">Belum ada komentar atau gift masuk.</p>}
              <ul className="max-h-64 space-y-1.5 overflow-auto">
                {feed.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 rounded-lg bg-background/60 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 break-words text-xs">{feedLine(e)}</span>
                    {e.vote_choice && <span className="rounded bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">VOTE {e.vote_choice.toUpperCase()}</span>}
                    {e.type === "comment" && !e.vote_choice && <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => showComment(e)}><Send /></Button>}
                  </li>
                ))}
              </ul>
              {!!feed.length && <Button size="sm" variant="ghost" onClick={liveActions.clearFeed}><RotateCcw /> Bersihkan tampilan</Button>}
              <details className="rounded-lg border border-border p-2 text-xs">
                <summary className="cursor-pointer font-semibold">Uji tanpa TikTok</summary>
                <p className="my-2 text-muted-foreground">Kirim event palsu lewat jalur yang sama dengan konektor. Untuk tes vote, kirim This or That / Hot Take ke overlay dulu.</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("comment-a")}>Komentar “A”</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("comment-b")}>Komentar “B”</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("comment")}>Komentar biasa</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("gift")}>Gift (dari pemilih A/B terakhir)</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("follow")}>Follow</Button>
                </div>
              </details>
            </div>
          )}

          {open === "inbox" && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-lg bg-background/60 p-2 text-xs">
                <span className="flex-1 truncate">{audienceUrl(code)}</span>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(audienceUrl(code)); toast("Link penonton disalin — taruh di bio!"); }}><Copy /></Button>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {([["pending", `Masuk (${inbox.length})`], ["history", `Riwayat (${history.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setView(k)} className={`rounded-md py-1.5 text-xs font-semibold ${view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>

              {view === "pending" && !inbox.length && <p className="py-6 text-center text-muted-foreground">Belum ada kiriman. Bagikan link di atas ke penonton.</p>}
              {view === "history" && !history.length && <p className="py-6 text-center text-muted-foreground">Belum ada riwayat. Kiriman yang kamu simpan, tampilkan, atau tolak muncul di sini.</p>}

              <ul className="max-h-80 space-y-2 overflow-auto">
                {view === "pending" && inbox.map((s) => (
                  <li key={s.id} className="rounded-xl bg-background/60 p-3">
                    <p className="text-xs font-semibold text-pop">{kindLabel(s.kind)} · {s.nickname || "Anonim"}</p>
                    <p className="my-1.5">{s.content}</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="live" onClick={() => { show(s); void liveActions.setStatus(s.id, "shown"); }}><Send /> Tampilkan</Button>
                      <Button size="sm" variant="secondary" disabled={savingId === s.id} onClick={() => void save(s)}><BookmarkPlus /> {savingId === s.id ? "Menyimpan…" : "Simpan ke Bank"}</Button>
                      <Button size="sm" variant="ghost" aria-label="Tolak" onClick={() => void liveActions.setStatus(s.id, "rejected")}><X /></Button>
                    </div>
                  </li>
                ))}
                {view === "history" && history.map((s) => (
                  <li key={s.id} className="rounded-xl bg-background/60 p-3">
                    <p className="text-xs font-semibold text-pop">{kindLabel(s.kind)} · {s.nickname || "Anonim"} · <span className="text-muted-foreground">{statusLabel[s.status] ?? s.status}</span></p>
                    <p className="my-1.5">{s.content}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.status !== "approved" && <Button size="sm" variant="secondary" disabled={savingId === s.id} onClick={() => void save(s)}><BookmarkPlus /> {savingId === s.id ? "Menyimpan…" : "Simpan ke Bank"}</Button>}
                      <Button size="sm" variant="ghost" onClick={() => show(s)}><Send /> Tampilkan</Button>
                      <Button size="sm" variant="ghost" onClick={() => void liveActions.setStatus(s.id, "pending")}><RotateCcw /> Kembalikan</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Fab label="Vote" onClick={() => setOpen(open === "votes" ? null : "votes")} active={open === "votes"}><MessageCircle className="h-5 w-5" />{voting && <span className="text-xs font-bold">{totals.a}:{totals.b}</span>}</Fab>
        <Fab label="Gift" onClick={() => setOpen(open === "gift" ? null : "gift")} active={open === "gift"}><Gift className="h-5 w-5" /></Fab>
        <Fab label="Feed" onClick={() => setOpen(open === "feed" ? null : "feed")} active={open === "feed"}>
          <Radio className="h-5 w-5" /><span className={`h-2 w-2 rounded-full ${tk.connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
        </Fab>
        <Fab label="Inbox" onClick={() => setOpen(open === "inbox" ? null : "inbox")} active={open === "inbox"}>
          <Inbox className="h-5 w-5" />{inbox.length > 0 && <span className="rounded-full bg-pop px-1.5 text-xs font-bold text-background">{inbox.length}</span>}
        </Fab>
      </div>
    </div>
  );
}

function Fab({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button aria-label={label} onClick={onClick} className={`flex h-12 items-center gap-1.5 rounded-full px-4 shadow-glow transition active:scale-95 ${active ? "bg-party" : "border border-border bg-card"}`}>{children}</button>
  );
}

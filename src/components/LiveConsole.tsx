import { useEffect, useState } from "react";
import { BookmarkPlus, Copy, Gift, Inbox, MessageCircle, Radio, RotateCcw, SlidersHorizontal, X, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BANKABLE_KINDS, liveActions, onAirGimmick, QUEUE_KINDS, sortVip, tierFor, TIER_BADGE, TIER_NAME, totalVotes, useLive, vipOf, type LiveEvent, type Submission } from "@/lib/cloud";
import { actions, GIMMICKS, readOverlay, sendToOverlay, showBanner, subscribeOverlay, useKyoka, type Intake } from "@/lib/kyoka";

export function audienceUrl(code: string | null) {
  return typeof window !== "undefined" && code ? `${window.location.origin}/live/${code}` : "";
}

/** Floating control for audience participation: votes, TikTok comment tally, gifts, inbox. */
export function LiveConsole() {
  const [open, setOpen] = useState<"votes" | "gift" | "inbox" | "feed" | "control" | null>(null);
  const [, force] = useState(0);
  useEffect(() => subscribeOverlay(() => force((n) => n + 1)), []);
  const inbox = useLive((l) => l.inbox);
  const history = useLive((l) => l.history);
  const feed = useLive((l) => l.feed);
  const tk = useLive((l) => l.tiktokLive);
  const review = useLive((l) => l.review);
  const queue = useLive((l) => l.queue);
  const nowShowing = useLive((l) => l.nowShowing);
  const intake = useLive((l) => l.intake);
  const queueSeconds = useKyoka((st) => st.settings.queueSeconds);
  const autoQueue = useKyoka((st) => st.settings.autoQueue);
  const vipAutoQueue = useKyoka((st) => st.settings.vipAutoQueue);
  const [view, setView] = useState<"pending" | "review" | "history">("pending");
  const [kindFilter, setKindFilter] = useState("all");
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
  const show = (s: Submission) => sendToOverlay({ gimmick: "audience", kind: s.kind, content: s.content ?? "", ...(s.nickname ? { nickname: s.nickname } : {}) });
  const KIND_LABEL: Record<string, string> = {
    confession: "🤫 Confession", thisorthat: "⚡ This or That", hottake: "🔥 Hot Take", chaos: "🌀 3 Kata", spin: "🎡 Spin (!spin)",
    problem: "🌀 Masalah", question: "💬 Pertanyaan",
  };
  const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
  const statusLabel: Record<string, string> = { approved: "✅ Di Question Bank", shown: "📺 Sudah ditampilkan", rejected: "🚫 Ditolak" };
  const who = (s: Submission) => (s.nickname ? `${TIER_BADGE[vipOf(s)] ? `${TIER_BADGE[vipOf(s)]} ` : ""}@${s.nickname}` : "Anonim");
  const badgeOf = (uid: string | null) => { const d = uid ? live.gifters[uid]?.diamonds ?? 0 : 0; const t = tierFor(d); return t ? `${TIER_BADGE[t]} ` : ""; };
  const body = (s: Submission) => (s.kind === "thisorthat" ? (s.content ?? "").replace(" | ", "  ⚔  ") : s.content);
  const isQueued = (s: Submission) => queue.some((x) => x.id === s.id) || nowShowing?.id === s.id;
  const primary = (s: Submission) => {
    if (QUEUE_KINDS.has(s.kind)) {
      const queued = isQueued(s);
      return <Button size="sm" variant="live" disabled={queued} onClick={() => liveActions.enqueue(s)}><Send /> {queued ? "Dalam antrean" : "Antrekan"}</Button>;
    }
    if (s.kind === "thisorthat" || s.kind === "hottake" || s.kind === "chaos") {
      return <Button size="sm" variant="live" onClick={() => { if (!liveActions.startRound(s)) toast.error("Isi kiriman tidak valid untuk dijadikan ronde."); }}><Send /> {s.kind === "chaos" ? "Jadikan cerita" : "Jadikan ronde"}</Button>;
    }
    return <Button size="sm" variant="live" onClick={() => { show(s); void liveActions.setStatus(s.id, "shown"); }}><Send /> Tampilkan</Button>;
  };
  const bankBtn = (s: Submission) => BANKABLE_KINDS.has(s.kind) && (
    <Button size="sm" variant="secondary" disabled={savingId === s.id} onClick={() => void save(s)}><BookmarkPlus /> {savingId === s.id ? "Menyimpan…" : "Simpan ke Bank"}</Button>
  );
  const matches = (l: Submission[]) => sortVip(kindFilter === "all" ? l : l.filter((x) => x.kind === kindFilter));
  const onAir = GIMMICKS.find((g) => g.id === onAirGimmick());

  const showComment = (e: LiveEvent) => sendToOverlay({ gimmick: "audience", kind: "question", content: e.content ?? "", nickname: e.nickname ?? undefined });
  const feedLine = (e: LiveEvent) => {
    const who = `${badgeOf(e.user_id)}@${e.nickname || e.user_id || "penonton"}`;
    if (e.type === "gift") return `🎁 ${who} kirim ${e.gift_name ?? "gift"}${e.gift_count > 1 ? ` ×${e.gift_count}` : ""}`;
    if (e.type === "follow") return `➕ ${who} follow`;
    if (e.type === "share") return `🔁 ${who} membagikan LIVE`;
    return `${e.flagged ? "⚠️ " : ""}${who}: ${e.content ?? ""}`;
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
            <h3 className="font-display text-sm font-bold">{open === "votes" ? "Vote Penonton" : open === "gift" ? "Gift TikTok" : open === "feed" ? "Live Feed TikTok" : open === "control" ? "Kontrol Siaran" : `Inbox Penonton (${inbox.length})`}</h3>
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
              <p className="text-xs text-muted-foreground">Vote masuk otomatis dari komentar TikTok: “A”/“B” untuk This or That, “setuju”/“tidak” untuk Hot Take. Tombol di atas untuk koreksi manual.</p>
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
              {live.perks.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-pop/40 bg-background/60 p-2.5">
                  <p className="text-xs font-bold text-pop">🎁 Hak istimewa menunggu</p>
                  {live.perks.map((pk) => (
                    <div key={pk.id} className="flex items-start gap-2 text-xs">
                      <span className="min-w-0 flex-1 break-words">{pk.tier ? `${TIER_BADGE[pk.tier]} ` : ""}{pk.who} — {pk.text}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => liveActions.donePerk(pk.id)}>Selesai</Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 rounded-xl bg-background/60 p-2.5">
                <div className="flex items-center justify-between"><p className="text-xs font-bold">🏆 Top Gifter sesi ini</p>
                  <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={liveActions.showLeaderboard}>Tampilkan</Button><Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={liveActions.resetVip}>Reset</Button></div></div>
                {liveActions.topGifters(5).length === 0 && <p className="text-xs text-muted-foreground">Belum ada. Penonton yang kirim gift otomatis jadi ⭐ Supporter, 💎 VIP, atau 👑 Sultan sesuai total diamond.</p>}
                <ol className="space-y-0.5 text-xs">
                  {liveActions.topGifters(5).map((g, i) => <li key={g.user_id} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {TIER_BADGE[tierFor(g.diamonds)]} @{g.nickname}</span><span className="text-muted-foreground">{g.diamonds} 💎 · {TIER_NAME[tierFor(g.diamonds)]}</span></li>)}
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">Tap saat gift masuk di TikTok (kalau konektor belum dipakai). VIP: kiriman !spin mereka didahulukan dan tampil dengan lencana. Atur batas tier di Settings.</p>
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
                    {e.type === "comment" && !e.vote_choice && !e.flagged && <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => showComment(e)}><Send /></Button>}
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
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("spin")}>Komentar “!spin …”</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("gift")}>Gift (dari pemilih A/B terakhir)</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("gift-big")}>Gift besar 1500💎 (jadi 👑)</Button>
                  <Button size="sm" variant="secondary" onClick={() => void liveActions.sendTestEvent("follow")}>Follow</Button>
                </div>
              </details>
            </div>
          )}

          {open === "control" && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Sedang tayang di overlay</p>
                <p className="font-display font-bold">{onAir ? `${onAir.emoji} ${onAir.name}` : "— belum ada —"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hanya satu gimmick tayang. Pindah gimmick lewat halaman Gimmicks (kirim ke overlay) — kamu yang menentukan kapan.</p>
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Kiriman lewat link di bio (anonim)</p>
                {([["confession", "Confession"], ["thisorthat", "This or That (dua pilihan)"], ["hottake", "Hot Take"], ["chaos", "Random Chaos (3 kata)"]] as [keyof Intake, string][]).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2"><span>{label}</span>
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={intake[k]} onChange={(e) => void liveActions.setIntake(k, e.target.checked)} />
                  </label>
                ))}
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Lewat komentar (hanya saat dimainkan)</p>
                <label className="flex items-center justify-between gap-2"><span>Terima <b>!spin pertanyaan</b></span>
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={intake.spin} onChange={(e) => void liveActions.setIntake("spin", e.target.checked)} />
                </label>
                {intake.spin && onAir?.id !== "spin" && <p className="text-xs text-pop">Input spin terbuka, tapi gimmick Spin belum tayang.</p>}
                <p className="text-xs text-muted-foreground">Vote This or That (A/B) dan Hot Take (setuju/tidak) otomatis aktif hanya saat gimmick-nya tayang.</p>
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Antrean overlay</p>
                <label className="block text-xs">Tiap item tampil {queueSeconds} detik
                  <input type="range" min={3} max={30} value={queueSeconds} onChange={(e) => actions.updateSettings({ queueSeconds: Number(e.target.value) })} className="mt-1 w-full" />
                </label>
                <label className="flex items-center justify-between gap-2"><span>Otomatis antrekan yang cocok dengan gimmick tayang</span>
                  <input type="checkbox" className="h-4 w-4" checked={autoQueue} onChange={(e) => actions.updateSettings({ autoQueue: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between gap-2"><span>VIP (⭐💎👑) otomatis masuk antrean</span>
                  <input type="checkbox" className="h-4 w-4" checked={vipAutoQueue} onChange={(e) => actions.updateSettings({ vipAutoQueue: e.target.checked })} />
                </label>
                {(autoQueue || vipAutoQueue) && <p className="text-xs text-muted-foreground">Kiriman yang ditandai “perlu dicek” tidak pernah otomatis tampil.</p>}
                {nowShowing && <p className="rounded-lg bg-card p-2 text-xs">Tampil: {body(nowShowing)}</p>}
                {queue.length > 0 && <ul className="max-h-24 space-y-1 overflow-auto text-xs text-muted-foreground">{queue.map((q, i) => <li key={q.id}>{i + 1}. {body(q)}</li>)}</ul>}
                {(nowShowing || queue.length > 0) && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={liveActions.skipQueue}>Lewati</Button>
                    <Button size="sm" variant="ghost" onClick={liveActions.clearQueue}>Kosongkan</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {open === "inbox" && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 rounded-lg bg-background/60 p-2 text-xs">
                <span className="flex-1 truncate">{audienceUrl(code)}</span>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(audienceUrl(code)); toast("Link penonton disalin — taruh di bio!"); }}><Copy /></Button>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                {([["pending", `Masuk (${inbox.length})`], ["review", `Cek (${review.length})`], ["history", `Riwayat (${history.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setView(k)} className={`rounded-md py-1.5 text-xs font-semibold ${view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                <option value="all">Semua jenis</option>
                {["confession", "thisorthat", "hottake", "chaos", "spin"].map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </select>

              {view === "pending" && !matches(inbox).length && <p className="py-6 text-center text-muted-foreground">Belum ada kiriman. Bagikan link di atas ke penonton.</p>}
              {view === "review" && !matches(review).length && <p className="py-6 text-center text-muted-foreground">Tidak ada yang perlu dicek. Kiriman dengan kata tidak pantas, tautan, atau nomor telepon muncul di sini.</p>}
              {view === "history" && !matches(history).length && <p className="py-6 text-center text-muted-foreground">Belum ada riwayat.</p>}

              <ul className="max-h-80 space-y-2 overflow-auto">
                {view === "pending" && matches(inbox).map((s) => (
                  <li key={s.id} className="rounded-xl bg-background/60 p-3">
                    <p className="text-xs font-semibold text-pop">{kindLabel(s.kind)} · {who(s)}</p>
                    <p className="my-1.5 break-words">{body(s)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {primary(s)}{bankBtn(s)}
                      <Button size="sm" variant="ghost" aria-label="Tolak" onClick={() => void liveActions.setStatus(s.id, "rejected")}><X /></Button>
                    </div>
                  </li>
                ))}
                {view === "review" && matches(review).map((s) => (
                  <li key={s.id} className="rounded-xl border border-pop/40 bg-background/60 p-3">
                    <p className="text-xs font-semibold text-pop">⚠️ Perlu dicek ({s.flag_reason ?? "terdeteksi"}) · {kindLabel(s.kind)} · {who(s)}</p>
                    <p className="my-1.5 break-words">{body(s)}</p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => void liveActions.setStatus(s.id, "pending")}>Loloskan</Button>
                      <Button size="sm" variant="ghost" onClick={() => void liveActions.setStatus(s.id, "rejected")}><X /> Tolak</Button>
                    </div>
                  </li>
                ))}
                {view === "history" && matches(history).map((s) => (
                  <li key={s.id} className="rounded-xl bg-background/60 p-3">
                    <p className="text-xs font-semibold text-pop">{kindLabel(s.kind)} · {who(s)} · <span className="text-muted-foreground">{statusLabel[s.status] ?? s.status}</span></p>
                    <p className="my-1.5 break-words">{body(s)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.status !== "approved" && bankBtn(s)}
                      {s.status !== "rejected" && primary(s)}
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
          {review.length > 0 && <span title="Perlu dicek">⚠️</span>}
        </Fab>
        <Fab label="Kontrol" onClick={() => setOpen(open === "control" ? null : "control")} active={open === "control"}>
          <SlidersHorizontal className="h-5 w-5" />{(queue.length > 0 || nowShowing) && <span className="rounded-full bg-pop px-1.5 text-xs font-bold text-background">{queue.length + (nowShowing ? 1 : 0)}</span>}
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

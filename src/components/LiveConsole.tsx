import { useEffect, useState, type ReactNode } from "react";
import { BookmarkPlus, ChevronDown, Copy, Gift, Inbox, LayoutGrid, ListPlus, MessageCircle, Radio, RotateCcw, ShieldAlert, SlidersHorizontal, X, Send } from "lucide-react";
import { toast } from "sonner";
import { WaitingQueue } from "@/components/WaitingQueue";
import { ConfirmDelete, timeAgo } from "@/components/AudienceHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BANKABLE_KINDS, INBOX_LIMIT, liveActions, waitingOf, waitingOrder, isFast, onAirGimmick, QUEUE_KINDS, sortVip, tierFor, TIER_BADGE, TIER_NAME, totalVotes, useLive, vipOf, type LiveEvent, type Submission } from "@/lib/cloud";
import { getSettings, GIMMICKS, readOverlay, sendToOverlay, showBanner, subscribeOverlay, useKyoka, type Intake } from "@/lib/kyoka";

export function audienceUrl(code: string | null) {
  if (typeof window === "undefined" || !code) return "";
  // Kalau dashboard dijalankan lokal, link untuk penonton harus memakai alamat publik (Settings › Alamat publik).
  const custom = getSettings().publicUrl.trim().replace(/\/+$/, "");
  const base = custom ? (/^https?:\/\//i.test(custom) ? custom : `https://${custom}`) : window.location.origin;
  return `${base}/live/${code}`;
}

const EXPANDED_KEY = "kyoka:console:expanded";

/** Floating control for audience participation: votes, TikTok comment tally, gifts, inbox. Terlipat jadi satu tombol secara default. */
const PAGE = 15;
const KIND_ORDER = ["confession", "thisorthat", "hottake", "chaos", "problem", "question", "spin", "card"];
const QUEUE_PLAY = ["confession", "hottake", "thisorthat"] as const;

/** Teks kiriman dipotong 3 baris supaya Inbox tetap ringkas; ketuk untuk membuka/menutup. */
function Clamped({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140;
  return (
    <p className={`my-1 break-words text-sm ${long ? "cursor-pointer" : ""}`} onClick={() => long && setOpen(!open)} title={long ? "Ketuk untuk buka/tutup" : undefined}
      style={!open && long ? { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{text}</p>
  );
}

/** Tombol ikon kecil dengan tooltip: dipakai untuk aksi sekunder supaya baris kiriman tetap satu baris. */
function IconBtn({ label, children, ...rest }: { label: string; children: ReactNode } & Omit<React.ComponentProps<typeof Button>, "children" | "size" | "title">) {
  return <Button size="sm" variant="secondary" className="h-8 w-8 shrink-0 px-0" aria-label={label} title={label} {...rest}>{children}</Button>;
}

export function LiveConsole() {
  const [open, setOpen] = useState<"votes" | "gift" | "inbox" | "feed" | "control" | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Dibaca setelah mount (bukan di initial state) supaya render server dan klien sama.
  useEffect(() => { try { setExpanded(localStorage.getItem(EXPANDED_KEY) === "1"); } catch { /* ignore */ } }, []);
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) setOpen(null); // melipat juga menutup panel yang terbuka
    try { localStorage.setItem(EXPANDED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  };
  const [, force] = useState(0);
  useEffect(() => subscribeOverlay(() => force((n) => n + 1)), []);
  const overlayConnected = useLive((l) => l.overlayConnected);
  const overlayVisible = readOverlay().visible;
  const togglePanic = () => {
    if (readOverlay().visible) {
      liveActions.panic();
      toast("🚨 Overlay disembunyikan, antrean dikosongkan", { action: { label: "Tampilkan lagi", onClick: () => liveActions.unpanic() }, duration: 8000 });
    } else {
      liveActions.unpanic();
      toast.success("Overlay ditampilkan lagi");
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.code === "KeyH") { e.preventDefault(); togglePanic(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const inbox = useLive((l) => l.inbox);
  const history = useLive((l) => l.history);
  const feed = useLive((l) => l.feed);
  const tk = useLive((l) => l.tiktokLive);
  const review = useLive((l) => l.review);
  const queue = useLive((l) => l.queue);
  const nowShowing = useLive((l) => l.nowShowing);
  const intake = useLive((l) => l.intake);
  const followStats = useLive((l) => l.followStats);
  const [testFollower, setTestFollowerUi] = useState(true);
  const queuePaused = useLive((l) => l.queuePaused);
  const [view, setView] = useState<"pending" | "review" | "history">("pending");
  const [kindFilter, setKindFilter] = useState("all");
  const [waitOpen, setWaitOpen] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [testText, setTestText] = useState("");
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
    problem: "🌀 Masalah", question: "💬 Pertanyaan", card: "🃏 Pick a Card",
  };
  const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
  const statusLabel: Record<string, string> = { approved: "✅ Di Question Bank", shown: "📺 Sudah ditampilkan", rejected: "🚫 Ditolak" };
  const shortStatus: Record<string, string> = { approved: "✅ Di Bank", shown: "📺 Tayang", rejected: "🚫 Ditolak" };
  const who = (s: Submission) => {
    const b = TIER_BADGE[vipOf(s)];
    const lead = `${isFast(s) ? "⚡ " : ""}${b ? `${b} ` : ""}`;
    const gifter = s.verified_uid ? live.gifters[s.verified_uid]?.nickname : undefined;
    return s.nickname ? `${lead}@${s.nickname}` : `${lead}Anonim${gifter ? ` (@${gifter} ✓)` : ""}`;
  };
  const badgeOf = (uid: string | null) => { const d = uid ? live.gifters[uid]?.diamonds ?? 0 : 0; const t = tierFor(d); return t ? `${TIER_BADGE[t]} ` : ""; };
  const body = (s: Submission) => (s.kind === "thisorthat" ? (s.content ?? "").replace(" | ", "  ⚔  ") : s.content);
  const isQueued = (s: Submission) => queue.some((x) => x.id === s.id) || nowShowing?.id === s.id;
  const primary = (s: Submission) => {
    if (s.kind === "card") return null;
    if (QUEUE_KINDS.has(s.kind)) {
      const queued = isQueued(s);
      return (
        <>
          <Button size="sm" variant="live" onClick={() => liveActions.showNow(s)}><Send /> Tampilkan</Button>
          <IconBtn label={queued ? "Sudah dalam antrean" : "Antrekan"} disabled={queued} onClick={() => liveActions.enqueue(s)}><ListPlus /></IconBtn>
        </>
      );
    }
    return <Button size="sm" variant="live" onClick={() => { show(s); void liveActions.setStatus(s.id, "shown"); }}><Send /> Tampilkan</Button>;
  };
  const bankBtn = (s: Submission) => BANKABLE_KINDS.has(s.kind) && (
    <IconBtn label={savingId === s.id ? "Menyimpan…" : "Simpan ke Question Bank"} disabled={savingId === s.id} onClick={() => void save(s)}><BookmarkPlus /></IconBtn>
  );
  const matches = (l: Submission[]) => sortVip(kindFilter === "all" ? l : l.filter((x) => x.kind === kindFilter));
  const onAir = GIMMICKS.find((g) => g.id === onAirGimmick());

  // Inbox: daftar sesuai tab/jenis; untuk jenis antrean, urutan = urutan putar (nomor #) supaya yang terlihat = yang akan tampil.
  const list = view === "pending" ? inbox : view === "review" ? review : history;
  const chips: [string, string][] = [["all", `Semua (${list.length})`], ...KIND_ORDER.filter((k) => k === kindFilter || list.some((x) => x.kind === k)).map((k): [string, string] => [k, `${kindLabel(k)} (${list.filter((x) => x.kind === k).length})`])];
  const posMap = new Map<string, number>();
  let rows = matches(list);
  if (view === "pending" && (QUEUE_PLAY as readonly string[]).includes(kindFilter)) {
    const w = waitingOrder(waitingOf(live, kindFilter));
    w.forEach((x, i) => posMap.set(x.id, i + 1));
    rows = [...rows.filter((x) => !posMap.has(x.id)), ...w];
  }
  const visibleRows = rows.slice(0, limit);
  const waitingTotal = QUEUE_PLAY.reduce((n, k) => n + waitingOf(live, k).length, 0);
  const queueActive = !!nowShowing && (QUEUE_PLAY as readonly string[]).includes(nowShowing.kind);
  const row = (s: Submission, lead: ReactNode, actions: ReactNode, cls = "") => (
    <li key={s.id} className={`space-y-1.5 rounded-xl border border-border/60 bg-background/50 p-3 ${cls}`}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-semibold text-pop">{lead}{kindFilter === "all" ? `${kindLabel(s.kind)} · ` : ""}{who(s)}</span>
        <span className="shrink-0 text-muted-foreground">{timeAgo(s.created_at)}</span>
      </div>
      <Clamped text={body(s) ?? ""} />
      <div className="flex items-center gap-1.5">{actions}</div>
    </li>
  );

  const showComment = (e: LiveEvent) => sendToOverlay({ gimmick: "audience", kind: "question", content: e.content ?? "", nickname: e.nickname ?? undefined });
  const feedLine = (e: LiveEvent) => {
    const who = `${badgeOf(e.user_id)}@${e.nickname || e.user_id || "penonton"}`;
    if (e.type === "gift") return `🎁 ${who} kirim ${e.gift_name ?? "gift"}${e.gift_count > 1 ? ` ×${e.gift_count}` : ""}`;
    if (e.type === "follow") return `➕ ${who} follow`;
    if (e.type === "share") return `🔁 ${who} membagikan LIVE`;
    return `${e.flagged ? "⚠️ " : ""}${who}: ${e.content ?? ""}${intake.followersOnly && e.is_follower !== true ? "  🚫 bukan follower" : ""}`;
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
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-30 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:bottom-5 md:right-5">
      {open && (
        <div className="max-h-[calc(100dvh-12.5rem)] w-[min(92vw,380px)] scroll-slim overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-border bg-popover px-4 pb-4 shadow-glow animate-pop-in md:max-h-[calc(100dvh-8rem)]">
          <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between border-b border-border bg-popover px-4 py-3">
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
              <p className="text-xs text-muted-foreground">Tap saat gift masuk di TikTok (kalau konektor belum dipakai). Gift dicatat untuk Top Gifter dan lencana tier (atur batas tier di Settings).</p>
            </div>
          )}

          {open === "feed" && (
            <div className="space-y-2 text-sm">
              <div className={`flex items-center gap-2 rounded-lg p-2 text-xs font-semibold ${tk.connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-2 w-2 rounded-full ${tk.connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
                {tk.connected ? `Konektor TikTok aktif${tk.handle ? ` · @${tk.handle}` : ""}` : "Konektor TikTok belum aktif — lihat Settings › TikTok LIVE"}
              </div>
              {!feed.length && <p className="py-4 text-center text-muted-foreground">Belum ada komentar atau gift masuk.</p>}
              <ul className="space-y-1.5">
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
                <label className="mb-2 flex items-center gap-2"><input type="checkbox" checked={testFollower} onChange={(e) => { setTestFollowerUi(e.target.checked); liveActions.setTestFollower(e.target.checked); }} /> Penguji dianggap follower</label>
                <form className="mb-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const v = testText.trim(); if (v) { void liveActions.sendTestEvent("custom", v); setTestText(""); } }}>
                  <input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Komentar bebas, mis. !fast AB12C" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" />
                  <Button size="sm" variant="secondary" type="submit">Kirim</Button>
                </form>
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
              <div className="space-y-1 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cek siap live</p>
                {([
                  [overlayConnected, "Overlay terhubung", "Overlay belum dibuka di TikTok LIVE Studio"],
                  [tk.connected, `Konektor TikTok aktif${tk.handle ? ` (@${tk.handle})` : ""}`, "Konektor TikTok belum jalan atau belum live"],
                  [!!code, "Link penonton siap", "Link penonton belum tersedia"],
                  [!!live.ingestKey, "Kunci konektor siap (database terbaru)", "Kunci konektor kosong. Jalankan migrasi database"],
                  [overlayVisible, "Overlay tampil", "Overlay sedang disembunyikan (tombol Panik aktif)"],
                ] as [boolean, string, string][]).map(([ok, good, bad]) => <p key={good} className={`text-xs ${ok ? "text-success" : "text-pop"}`}>{ok ? "✅" : "⚠️"} {ok ? good : bad}</p>)}
                <p className="pt-1 text-xs text-muted-foreground">Biarkan dashboard di jendela sendiri yang terlihat, jangan diminimalkan. Pintasan panik: Alt+Shift+H.</p>
              </div>
              <div className="rounded-xl bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Sedang tayang di overlay</p>
                <p className="font-display font-bold">{onAir ? `${onAir.emoji} ${onAir.name}` : "— belum ada —"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hanya satu gimmick tayang. Pindah gimmick lewat halaman Gimmicks (kirim ke overlay) — kamu yang menentukan kapan.</p>
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Kiriman lewat link di bio (anonim)</p>
                {([["spin", "Spin the Question (Bio Link + !spin)"], ["confession", "Confession"], ["card", "Pick a Card"], ["thisorthat", "This or That (dua pilihan)"], ["hottake", "Hot Take"], ["chaos", "Random Chaos (3 kata)"]] as [keyof Intake, string][]).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2"><span>{label}</span>
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={intake[k]} onChange={(e) => void liveActions.setIntake(k, e.target.checked)} />
                  </label>
                ))}
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Lewat komentar TikTok</p>
                <p className="text-xs text-muted-foreground">Status <b className={intake.spin ? "text-success" : "text-pop"}>{intake.spin ? "Terbuka" : "Ditutup"}</b> — pengaturan Spin di bagian link bio juga mengatur komentar <b>!spin</b>. Kiriman tetap diterima saat gimmick lain sedang tayang.</p>
                {intake.spin && onAir?.id !== "spin" && <p className="text-xs text-pop">Input spin terbuka, tapi gimmick Spin belum tayang.</p>}
                {intake.spin && onAir?.id === "spin" && <p className="text-xs text-muted-foreground">Komentar !spin masuk ke antrean Spin sesuai kapasitas dan jumlah irisan yang kamu atur.</p>}
                <label className="flex items-center justify-between gap-2"><span>🔒 Komentar hanya dari <b>follower</b></span>
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={intake.followersOnly} onChange={(e) => void liveActions.setIntake("followersOnly", e.target.checked)} />
                </label>
                {intake.followersOnly && <p className="text-xs text-muted-foreground">Berlaku untuk vote dan !spin. Komentar non-follower tetap tampil di Feed, tapi tidak dihitung. Gift tidak difilter.</p>}
                {intake.followersOnly && followStats.unknown >= 5 && followStats.known === 0 && (
                  <p className="rounded-lg bg-destructive/15 p-2 text-xs text-pop">⚠️ Status follower tidak terbaca dari TikTok, jadi semua komentar dianggap non-follower dan ditolak. Perbarui konektor ke v1.2 atau matikan opsi ini.</p>
                )}
                <p className="text-xs text-muted-foreground">Vote This or That (A/B) dan Hot Take (setuju/tidak) otomatis aktif hanya saat gimmick-nya tayang.</p>
              </div>

              <div className="space-y-2 rounded-xl bg-background/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Antrean overlay</p>
                <p className="text-xs text-muted-foreground">Confession, Hot Take, dan This or That dari penonton ditahan di Inbox dan tidak tampil sendiri. Tekan “Tampilkan antrean” di Inbox atau di halaman gimmick-nya untuk memutar semuanya berurutan; “Tampilkan” di tiap kiriman menampilkannya langsung. Lama tampil: Confession 3 mnt · Hot Take 2 mnt · Random Chaos 2 mnt · This or That 1,5 mnt. Antrean habis → layar tetap di kiriman terakhir. Kiriman yang ditandai “perlu dicek” tidak pernah otomatis tampil.</p>
                {nowShowing && <p className="rounded-lg bg-card p-2 text-xs">{queuePaused ? "⏸️ Ditahan" : "Tampil"}: {body(nowShowing)}</p>}
                {queue.length > 0 && <ul className="max-h-24 space-y-1 overflow-auto text-xs text-muted-foreground">{queue.map((q, i) => <li key={q.id}>{i + 1}. {body(q)}</li>)}</ul>}
                {!nowShowing && queue.length === 0 && <p className="text-xs text-muted-foreground">Antrean kosong.</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" disabled={!nowShowing} onClick={queuePaused ? liveActions.resumeQueue : liveActions.pauseQueue}>{queuePaused ? "▶️ Lanjutkan timer" : "⏸️ Tahan"}</Button>
                  <Button size="sm" variant="secondary" disabled={!nowShowing && queue.length === 0} onClick={liveActions.skipQueue}>⏭️ Lanjut</Button>
                  {queue.length > 0 && <Button size="sm" variant="ghost" onClick={liveActions.clearQueue}>Kosongkan antrean</Button>}
                </div>
              </div>
            </div>
          )}

          {open === "inbox" && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/50 py-1 pl-3 pr-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{audienceUrl(code)}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 px-0" aria-label="Salin link penonton" title="Salin link penonton" onClick={() => { navigator.clipboard.writeText(audienceUrl(code)); toast("Link penonton disalin — taruh di bio!"); }}><Copy /></Button>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                {([["pending", `Masuk (${inbox.length})`], ["review", `Cek (${review.length})`], ["history", `Riwayat (${history.length})`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setView(k); setLimit(PAGE); }} className={`rounded-lg py-1.5 text-xs font-semibold transition ${view === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>
              <div className="chip-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 pr-6">
                {chips.map(([k, l]) => (
                  <button key={k} onClick={() => { setKindFilter(k); setLimit(PAGE); }}
                    className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${kindFilter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>

              {view === "pending" && (waitingTotal > 0 || queueActive) && (
                <div className="rounded-xl border border-border/60 bg-background/50">
                  <button onClick={() => setWaitOpen(!waitOpen)} aria-expanded={waitOpen} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">⏳ Antrean menunggu{waitingTotal > 0 ? ` · ${waitingTotal}` : ""}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${waitOpen ? "rotate-180" : ""}`} />
                  </button>
                  {waitOpen && <div className="space-y-1.5 border-t border-border/60 px-3 py-2">{QUEUE_PLAY.map((k) => <WaitingQueue key={k} kind={k} compact />)}</div>}
                </div>
              )}
              {view === "pending" && inbox.length >= INBOX_LIMIT && <p className="text-[11px] text-pop">Menampilkan {INBOX_LIMIT} kiriman terbaru. Selesaikan atau tolak sebagian supaya yang lebih lama ikut terlihat.</p>}
              {view === "pending" && !rows.length && <p className="py-6 text-center text-muted-foreground">Belum ada kiriman. Bagikan link di atas ke penonton.</p>}
              {view === "review" && !rows.length && <p className="py-6 text-center text-muted-foreground">Tidak ada yang perlu dicek. Kiriman dengan kata tidak pantas, tautan, atau nomor telepon muncul di sini.</p>}
              {view === "history" && !rows.length && <p className="py-6 text-center text-muted-foreground">Belum ada riwayat.</p>}

              {view === "history" && rows.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{rows.length} riwayat{kindFilter !== "all" ? ` · ${kindLabel(kindFilter)}` : ""}</span>
                  <ConfirmDelete label={kindFilter === "all" ? "Hapus semua" : "Hapus yang tampil"} confirmLabel={`Yakin hapus ${rows.length}?`} className="h-7 px-2 text-[11px]" onConfirm={() => liveActions.deleteHistory(rows.map((x) => x.id))} />
                </div>
              )}

              <ul className="space-y-2">
                {view === "pending" && visibleRows.map((s) => row(s,
                  posMap.has(s.id) ? <b className="mr-1 rounded bg-primary/20 px-1 text-primary">#{posMap.get(s.id)}</b> : null,
                  <>{primary(s)}{bankBtn(s)}<Button size="sm" variant="ghost" className="ml-auto h-8 w-8 shrink-0 px-0" aria-label="Tolak" title="Tolak" onClick={() => void liveActions.setStatus(s.id, "rejected")}><X /></Button></>))}
                {view === "review" && visibleRows.map((s) => row(s, `⚠️ ${s.flag_reason ?? "terdeteksi"} · `,
                  <><Button size="sm" variant="secondary" onClick={() => void liveActions.setStatus(s.id, "pending")}>Loloskan</Button><Button size="sm" variant="ghost" className="ml-auto" onClick={() => void liveActions.setStatus(s.id, "rejected")}><X /> Tolak</Button></>,
                  "border-pop/40"))}
                {view === "history" && visibleRows.map((s) => row(s, <span className="mr-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{shortStatus[s.status] ?? s.status}</span>,
                  <>{s.status !== "rejected" && primary(s)}{s.status !== "approved" && bankBtn(s)}
                    <IconBtn label="Kembalikan ke Inbox" onClick={() => void liveActions.setStatus(s.id, "pending")}><RotateCcw /></IconBtn>
                    <ConfirmDelete compact label="Hapus dari riwayat" confirmLabel="Hapus?" className="ml-auto h-8 shrink-0 px-2" onConfirm={() => liveActions.deleteHistory([s.id])} /></>))}
              </ul>
              {rows.length > limit && <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit(limit + PAGE)}>Tampilkan lebih banyak ({rows.length - limit})</Button>}
            </div>
          )}
        </div>
      )}
      {expanded && (
        <div className="flex max-w-full flex-wrap justify-end gap-2 duration-200 animate-in fade-in-0 slide-in-from-bottom-2">
          <button aria-label={overlayVisible ? "Panik: sembunyikan overlay" : "Tampilkan overlay"} title="Alt+Shift+H"
            onClick={togglePanic}
            className={`flex h-12 items-center gap-1.5 rounded-full px-3 text-sm font-bold shadow-glow transition active:scale-95 sm:px-4 ${overlayVisible ? "bg-destructive text-destructive-foreground" : "bg-success text-background"}`}>
            <ShieldAlert className="h-5 w-5" /><span className="hidden sm:inline">{overlayVisible ? "Panik" : "Tampilkan"}</span>
          </button>
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
      )}
      <button aria-label={expanded ? "Lipat menu live" : "Buka menu live"} aria-expanded={expanded} onClick={toggleExpanded}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-glow transition active:scale-95 ${expanded ? "bg-party" : "border border-border bg-card"} ${!expanded && !overlayVisible ? "ring-4 ring-destructive/80" : ""}`}>
        {expanded ? <X className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
        {!expanded && (
          <>
            <span title={tk.connected ? "Konektor TikTok aktif" : "Konektor TikTok belum aktif"} className={`absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-card ${tk.connected ? "bg-success" : "bg-muted-foreground"}`} />
            {(inbox.length > 0 || review.length > 0) && (
              <span title={review.length > 0 ? "Ada kiriman yang perlu dicek" : "Kiriman penonton menunggu"} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-pop px-1 text-[10px] font-bold text-background">
                {inbox.length > 0 && inbox.length}{review.length > 0 && "⚠️"}
              </span>
            )}
            {!overlayVisible && <span title="Overlay disembunyikan (mode Panik)" className="absolute -left-1 -top-1 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-card bg-destructive" />}
          </>
        )}
      </button>
    </div>
  );
}

function Fab({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button aria-label={label} onClick={onClick} className={`flex h-12 items-center gap-1.5 rounded-full px-3 shadow-glow transition active:scale-95 sm:px-4 ${active ? "bg-party" : "border border-border bg-card"}`}>{children}</button>
  );
}

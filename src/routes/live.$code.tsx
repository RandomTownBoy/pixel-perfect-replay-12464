import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/live/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kirim ke Kyoka LIVE" },
      { name: "description", content: "Kirim confession, usulan This or That, hot take, atau 3 kata secara anonim ke Kyoka LIVE." },
      { property: "og:title", content: "Kirim ke Kyoka LIVE" },
      { property: "og:description", content: "Kirim confession dan usulan gimmick secara anonim saat Kyoka LIVE." },
    ],
  }),
  component: Audience,
});

type KindId = "confession" | "thisorthat" | "hottake" | "chaos";
type AState = {
  live?: boolean; round?: string; mode?: string; gimmick?: string; a?: string; b?: string; title?: string;
  intake?: Partial<Record<KindId | "spin", boolean>>;
};

const KINDS: { id: KindId; emoji: string; name: string; hint: string }[] = [
  { id: "confession", emoji: "🤫", name: "Confession", hint: "Pengakuan anonim. Kyoka memilih mana yang dibacakan." },
  { id: "thisorthat", emoji: "⚡", name: "This or That", hint: "Usul dua pilihan untuk ronde This or That." },
  { id: "hottake", emoji: "🔥", name: "Hot Take", hint: "Opini panasmu. Penonton lain vote setuju atau tidak di komentar." },
  { id: "chaos", emoji: "🌀", name: "3 Kata", hint: "Tulis 3 kata random. Kyoka bikin cerita atau solusi dari situ." },
];

function fingerprint(): string | undefined {
  try {
    let f = localStorage.getItem("kyoka-fp");
    if (!f) { f = crypto.randomUUID(); localStorage.setItem("kyoka-fp", f); }
    return f;
  } catch { return undefined; }
}

function Audience() {
  const { code } = Route.useParams();
  const [st, setSt] = useState<AState | null>(null);
  const [missing, setMissing] = useState(false);
  const [kind, setKind] = useState<KindId>("confession");
  const [text, setText] = useState("");
  const [pa, setPa] = useState("");
  const [pb, setPb] = useState("");
  const [w, setW] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [tt, setTt] = useState(() => { try { return localStorage.getItem("kyoka-tt") ?? ""; } catch { return ""; } });

  useEffect(() => {
    supabase.rpc("get_audience_state", { _code: code }).then(({ data, error }) => {
      if (error || data === null) return setMissing(true);
      setSt(data as AState);
    });
    const ch = supabase.channel(`audience-${code.toLowerCase()}`)
      .on("broadcast", { event: "state" }, ({ payload }) => setSt((cur) => ({ ...cur, ...(payload as AState) }))).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [code]);

  const closed = (k: KindId) => st?.intake?.[k] === false;

  const buildContent = (): string | null => {
    if (kind === "thisorthat") {
      const a = pa.trim(); const b = pb.trim();
      if (!a || !b) { toast.error("Isi kedua pilihan."); return null; }
      if (/\s(or|atau|vs)\s/i.test(` ${a} `) || /\s(or|atau|vs)\s/i.test(` ${b} `)) { toast.error("Jangan pakai kata “atau”, “or”, “vs” di dalam pilihan."); return null; }
      return `${a} atau ${b}`;
    }
    if (kind === "chaos") {
      const words = w.map((x) => x.trim());
      if (words.some((x) => !x)) { toast.error("Isi ketiga kata."); return null; }
      if (words.some((x) => /\s/.test(x))) { toast.error("Satu kata saja per kotak."); return null; }
      return words.join(", ");
    }
    const t = text.trim();
    if (t.length < 5) { toast.error("Isinya terlalu pendek."); return null; }
    return t;
  };

  const submit = async () => {
    if (closed(kind)) return;
    const content = buildContent();
    if (content === null) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_audience", {
      _code: code, _kind: kind, _round: "", _choice: "", _content: content, _nickname: "", _fingerprint: fingerprint(), _tiktok: tt.trim().replace(/^@/, ""),
    } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    try { localStorage.setItem("kyoka-tt", tt.trim().replace(/^@/, "")); } catch { /* abaikan */ }
    setText(""); setPa(""); setPb(""); setW(["", "", ""]);
    toast.success(kind === "confession" ? "Terkirim, aman dan anonim 🤫" : "Terkirim ke Kyoka!");
  };

  if (missing) return <Center>Link LIVE tidak ditemukan.</Center>;
  if (!st) return <Center>Memuat…</Center>;
  const cur = KINDS.find((k) => k.id === kind)!;
  const isClosed = closed(kind);
  const voting = st.mode === "vote";

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-party font-display font-black shadow-pop">K</span>
        <div className="flex-1"><h1 className="font-display text-sm font-bold">KYOKA LIVE</h1>
          <p className="text-xs text-muted-foreground">Kirim anonim, kapan saja</p></div>
        {st.live === false
          ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Istirahat</span>
          : <span className="flex items-center gap-1.5 rounded-full bg-pop/20 px-2.5 py-1 text-xs font-bold text-pop"><span className="h-2 w-2 animate-pulse rounded-full bg-pop" />LIVE</span>}
      </header>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
            className={`rounded-lg px-1 py-2 text-xs font-semibold ${kind === k.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"} ${closed(k.id) ? "opacity-50" : ""}`}>
            <span className="block text-base">{k.emoji}</span>{k.name}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-panel p-5">
        <p className="text-sm font-semibold">{cur.emoji} {cur.name}</p>
        <p className="text-xs text-muted-foreground">{cur.hint}</p>

        {(kind === "confession" || kind === "hottake") && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={kind === "confession" ? 500 : 200} rows={4} disabled={isClosed}
            placeholder={kind === "confession" ? "Ngaku aja… (anonim, jangan tulis info pribadi)" : "Opini panasmu…"}
            className="w-full rounded-xl border border-input bg-background p-3 text-sm" />
        )}
        {kind === "thisorthat" && (
          <div className="space-y-2">
            <Input placeholder="Pilihan 1, contoh: Ronaldo" maxLength={60} value={pa} onChange={(e) => setPa(e.target.value)} disabled={isClosed} />
            <p className="text-center text-xs font-bold text-muted-foreground">VS</p>
            <Input placeholder="Pilihan 2, contoh: Messi" maxLength={60} value={pb} onChange={(e) => setPb(e.target.value)} disabled={isClosed} />
          </div>
        )}
        {kind === "chaos" && (
          <div className="grid grid-cols-3 gap-2">
            {w.map((x, i) => (
              <Input key={i} placeholder={`Kata ${i + 1}`} maxLength={24} value={x} disabled={isClosed}
                onChange={(e) => setW(w.map((y, j) => (j === i ? e.target.value : y)))} />
            ))}
          </div>
        )}

        <label className="block text-xs text-muted-foreground">Username TikTok (opsional)
          <Input placeholder="@usernamekamu" maxLength={31} value={tt} onChange={(e) => setTt(e.target.value)} disabled={isClosed} className="mt-1" />
        </label>
        <p className="-mt-1 text-xs text-muted-foreground">Tidak ditampilkan di layar, kamu tetap anonim. Kalau kamu pernah kirim gift di LIVE, kirimanmu dapat jalur ⚡ fast track.</p>
        <Button size="lg" variant="live" className="w-full" disabled={busy || isClosed} onClick={submit}>{isClosed ? "Sedang ditutup" : "Kirim"}</Button>
        <p className="text-xs text-muted-foreground">Dikirim tanpa nama. Hindari info pribadi, tautan, dan kata kasar. Kiriman bisa disaring sebelum tampil.</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-panel p-5 text-sm">
        <p className="font-display font-bold">Ikut main langsung lewat komentar TikTok</p>
        {st.title && <p className="rounded-lg bg-background/60 px-3 py-2 text-xs"><span className="text-muted-foreground">Lagi tayang:</span> {st.title}</p>}
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {voting && st.gimmick === "hottake" && <li>🗳️ Vote: komen <b className="text-foreground">SETUJU</b> atau <b className="text-foreground">TIDAK</b></li>}
          {voting && st.gimmick !== "hottake" && <li>🗳️ Vote: komen <b className="text-foreground">A</b> ({st.a}) atau <b className="text-foreground">B</b> ({st.b})</li>}
          {!voting && <li>🗳️ Vote This or That dan Hot Take dibuka saat gimmick-nya tayang.</li>}
          <li>🎡 Pertanyaan spin: ketik <b className="text-foreground">!spin pertanyaanmu</b> {st.intake?.spin ? <b className="text-success">(sedang dibuka)</b> : "(dibuka saat Spin dimainkan)"}</li>
          <li>🎁 Kirim gift: kamu jadi VIP ⭐💎👑 dan kirimanmu lewat jalur ⚡ fast track.</li>
        </ul>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">{children}</div>;
}

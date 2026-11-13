import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { liveActions, useLive } from "@/lib/cloud";
import { actions, useKyoka } from "@/lib/kyoka";

export const Route = createFileRoute("/_authenticated/_studio/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Kyoka Live Studio" },
      { name: "description", content: "Profile, overlay, sound and AI settings." },
      { property: "og:title", content: "Settings — Kyoka Live Studio" },
      { property: "og:description", content: "Configure Kyoka Live Studio." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useKyoka((x) => x.settings);
  const ingestKey = useLive((l) => l.ingestKey);
  const tk = useLive((l) => l.tiktokLive);
  const [reveal, setReveal] = useState(false);
  const bannedWords = useKyoka((x) => x.settings.bannedWords);
  const guidePosition = useKyoka((x) => x.settings.guidePosition);
  const vipTiers = useKyoka((x) => x.settings.vipTiers);
  const [newWord, setNewWord] = useState("");
  const addWord = () => {
    const w = newWord.trim().toLowerCase();
    if (!w) return;
    if (!bannedWords.includes(w)) actions.updateSettings({ bannedWords: [...bannedWords, w] });
    setNewWord("");
  };
  const [handle, setHandle] = useState("");
  const envSnippet = () => [
    `SUPABASE_URL=${import.meta.env["VITE_SUPABASE_URL"] ?? ""}`,
    `SUPABASE_KEY=${import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? ""}`,
    `INGEST_KEY=${ingestKey ?? ""}`,
    `TIKTOK_USERNAME=${handle.replace(/^@/, "")}`,
  ].join("\n");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-3">
          <h3 className="font-display text-sm font-bold">Profil & Branding</h3>
          <label className="block text-sm">Nama kreator<Input value={s.creatorName} onChange={(e) => actions.updateSettings({ creatorName: e.target.value })} className="mt-1" /></label>
        </Panel>
        <Panel className="space-y-3">
          <h3 className="font-display text-sm font-bold">Default Gimmick</h3>
          <label className="block text-sm">Countdown This or That (detik)
            <Input type="number" min={3} max={60} value={s.countdown} onChange={(e) => actions.updateSettings({ countdown: +e.target.value || 10 })} className="mt-1" /></label>
          <label className="flex items-center justify-between text-sm">Efek suara overlay<input type="checkbox" checked={s.sound} onChange={(e) => actions.updateSettings({ sound: e.target.checked })} /></label>
        </Panel>
        <Panel className="space-y-2 text-sm">
          <h3 className="font-display text-sm font-bold">AI Provider</h3>
          <p className="text-muted-foreground">AI aktif lewat Lovable AI — tidak perlu API key. Kunci disimpan aman di server, tidak pernah di browser. Pemakaian AI memotong kredit workspace.</p>
        </Panel>
        <Panel className="space-y-3 text-sm md:col-span-2">
          <h3 className="font-display text-sm font-bold">Gift TikTok & Hadiahnya</h3>
          <p className="text-xs text-muted-foreground">“Suara” = gift menambah bobot vote di This or That / Hot Take. “Shoutout” = muncul banner terima kasih + hadiah di overlay.</p>
          {s.giftRules.map((r, i) => {
            const up = (patch: Partial<typeof r>) => actions.updateSettings({ giftRules: s.giftRules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <Input value={r.emoji} onChange={(e) => up({ emoji: e.target.value })} className="w-14 text-center" />
                <Input value={r.name} onChange={(e) => up({ name: e.target.value })} className="w-32" />
                <select value={r.effect} onChange={(e) => up({ effect: e.target.value as "vote" | "shoutout" })} className="h-9 rounded-md border border-input bg-background px-2">
                  <option value="vote">Suara</option><option value="shoutout">Shoutout</option>
                </select>
                {r.effect === "vote" && <Input type="number" min={1} value={r.weight} onChange={(e) => up({ weight: +e.target.value || 1, reward: `+${+e.target.value || 1} suara` })} className="w-20" />}
                <Input value={r.reward} onChange={(e) => up({ reward: e.target.value })} className="min-w-40 flex-1" placeholder="Hadiah" />
                <Button size="icon" variant="ghost" onClick={() => actions.updateSettings({ giftRules: s.giftRules.filter((_, j) => j !== i) })}>✕</Button>
              </div>
            );
          })}
          <Button size="sm" variant="secondary" onClick={() => actions.updateSettings({ giftRules: [...s.giftRules, { id: crypto.randomUUID(), name: "Gift baru", emoji: "🎁", effect: "shoutout", weight: 1, reward: "Request lagu!" }] })}>+ Tambah gift</Button>
        </Panel>
        <Panel className="space-y-3 text-sm md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold">TikTok LIVE (komentar & gift otomatis)</h3>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${tk.connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-2 w-2 rounded-full ${tk.connected ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
              {tk.connected ? `Konektor aktif${tk.handle ? ` · @${tk.handle}` : ""}` : "Konektor belum aktif"}
            </span>
          </div>
          <p className="text-muted-foreground">Konektor adalah program kecil yang kamu jalankan di komputer saat LIVE. Ia membaca komentar dan gift TikTok-mu, lalu mengirimnya ke studio ini lewat kunci di bawah. Kunci ini <b>bukan</b> password TikTok — jangan pernah membagikannya, dan jangan pernah memasukkan password TikTok di mana pun.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-3 py-2 text-xs">{ingestKey ? (reveal ? ingestKey : "•".repeat(24)) : "Kunci belum tersedia"}</code>
            <Button size="sm" variant="ghost" onClick={() => setReveal(!reveal)}>{reveal ? "Sembunyikan" : "Tampilkan"}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (await liveActions.rotateIngestKey()) toast.success("Kunci diganti. Perbarui juga di konektor."); }}>Ganti kunci</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Username TikTok (tanpa @)" value={handle} onChange={(e) => setHandle(e.target.value)} className="w-56" />
            <Button size="sm" variant="secondary" disabled={!ingestKey} onClick={() => { navigator.clipboard.writeText(envSnippet()); toast("Konfigurasi konektor disalin (isi file .env)."); }}>Salin konfigurasi konektor</Button>
          </div>
          <p className="text-xs text-muted-foreground">Sebelum konektor siap, kamu bisa menguji seluruh alurnya dari tombol <b>Feed</b> › “Uji tanpa TikTok” di pojok kanan bawah. Agar gift otomatis terhitung, nama gift di tabel atas harus sama dengan nama gift di TikTok (misalnya “Rose”).</p>
        </Panel>
        <Panel className="space-y-3 text-sm">
          <h3 className="font-display text-sm font-bold">Moderasi kata</h3>
          <p className="text-muted-foreground">Kiriman penonton dan komentar yang mengandung kata di daftar bawaan (kata kasar Indonesia &amp; Inggris), tautan, atau nomor telepon otomatis masuk <b>Cek</b>, tidak langsung tampil. Tambahkan kata sendiri di sini. Detektor tidak sempurna, jadi tetap periksa sebelum menampilkan.</p>
          <div className="flex gap-2">
            <Input placeholder="Tambah kata/frasa…" value={newWord} onChange={(e) => setNewWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addWord(); }} />
            <Button size="sm" variant="secondary" onClick={addWord}>Tambah</Button>
          </div>
          {bannedWords.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {bannedWords.map((w) => (
                <li key={w}><button className="rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-destructive/20" title="Klik untuk hapus" onClick={() => actions.updateSettings({ bannedWords: bannedWords.filter((x) => x !== w) })}>{w} ✕</button></li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="space-y-3 text-sm">
          <h3 className="font-display text-sm font-bold">VIP Gifter</h3>
          <p className="text-muted-foreground">Total diamond gift per penonton (dalam sesi ini) menentukan tier. VIP kirimannya didahulukan di antrean, tampil dengan lencana di overlay, dan kenaikan tier diumumkan lewat banner.</p>
          <div className="grid grid-cols-3 gap-2">
            {(["⭐ Supporter", "💎 VIP", "👑 Sultan"] as const).map((label, i) => (
              <label key={label} className="text-xs">{label} ≥
                <Input type="number" min={1} value={vipTiers[i]} onChange={(e) => { const next = [...vipTiers] as [number, number, number]; next[i] = Math.max(1, Number(e.target.value) || 1); actions.updateSettings({ vipTiers: next }); }} />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Dalam diamond. Bawaan: 1 / 100 / 1000. Tombol Reset di panel Gift memulai hitungan dari nol.</p>
        </Panel>

        <Panel className="space-y-3 text-sm">
          <h3 className="font-display text-sm font-bold">Panduan di overlay</h3>
          <p className="text-muted-foreground">Tulisan kecil untuk penonton (misalnya “Ketik !spin …”, “Confess lewat link di bio”) yang menyesuaikan gimmick tayang dan input yang sedang dibuka.</p>
          <select value={guidePosition} onChange={(e) => actions.updateSettings({ guidePosition: e.target.value as typeof guidePosition })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="tr">Kanan atas</option>
            <option value="tl">Kiri atas</option>
            <option value="br">Kanan bawah</option>
            <option value="bl">Kiri bawah</option>
            <option value="off">Sembunyikan</option>
          </select>
          <p className="text-xs text-muted-foreground">Tampilannya di overlay hadir di paket 3. Pengaturan ini sudah tersimpan.</p>
        </Panel>

        <Panel className="space-y-2 text-sm md:col-span-2">
          <h3 className="font-display text-sm font-bold">Data Demo</h3>
          <Button variant="destructive" onClick={() => confirm("Reset semua data ke contoh awal?") && actions.resetDemo()}>Reset data demo</Button>
        </Panel>
      </div>
    </>
  );
}

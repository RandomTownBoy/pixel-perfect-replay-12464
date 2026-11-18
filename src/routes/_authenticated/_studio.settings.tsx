import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notify";
import { liveActions, useLive } from "@/lib/cloud";
import { NumberField } from "@/components/NumberField";
import { LIMITS } from "@/lib/limits";
import { actions, QUEUE_KIND_LIST, QUEUE_SECONDS, useKyoka } from "@/lib/kyoka";

const QUEUE_LABEL = { confession: "🤫 Confession", hottake: "🔥 Hot Take", chaos: "🌀 Random Chaos", thisorthat: "⚡ This or That" } as const;

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
  const giftNotify = useKyoka((x) => x.settings.giftNotify);
  const autoSwitchQueue = useKyoka((x) => x.settings.autoSwitchQueue);
  const publicUrl = useKyoka((x) => x.settings.publicUrl);
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
            <NumberField min={LIMITS.countdown.min} max={LIMITS.countdown.max} value={s.countdown} onChange={(n) => actions.updateSettings({ countdown: n })} className="mt-1" /></label>
          <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-sm font-semibold">Durasi tayang antrean (detik)</p>
            <p className="text-xs text-muted-foreground">Lama tiap kiriman penonton tampil di overlay sebelum animasi penutup dan lanjut ke antrean berikutnya. Boleh dipersingkat, tidak boleh melebihi batas maksimum tiap gimmick.</p>
            <div className="grid grid-cols-2 gap-2">
              {QUEUE_KIND_LIST.map((k) => (
                <label key={k} className="space-y-1 text-xs text-muted-foreground">{QUEUE_LABEL[k]} <span className="opacity-70">(maks. {QUEUE_SECONDS[k]})</span>
                  <NumberField min={Math.min(LIMITS.queueMinSeconds, QUEUE_SECONDS[k])} max={QUEUE_SECONDS[k]} value={s.queueDurations[k]} onChange={(n) => actions.updateSettings({ queueDurations: { ...s.queueDurations, [k]: n } })} className="h-9 text-sm text-foreground" />
                </label>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => actions.updateSettings({ queueDurations: { ...QUEUE_SECONDS } })}>Kembalikan ke maksimum</Button>
          </div>
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
                {r.effect === "vote" && <NumberField min={LIMITS.giftWeight.min} max={LIMITS.giftWeight.max} value={r.weight} onChange={(n) => up({ weight: n, reward: `+${n} suara` })} className="w-20" aria-label="Bobot suara" />}
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
            <code className="min-w-0 flex-1 break-all rounded-lg bg-background/60 px-3 py-2 text-xs">{ingestKey ? (reveal ? ingestKey : "•".repeat(24)) : "Kunci belum tersedia"}</code>
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
          <h3 className="font-display text-sm font-bold">Alamat publik (link penonton)</h3>
          <p className="text-muted-foreground">Kalau kamu menjalankan studio ini di komputermu (localhost), link untuk penonton harus memakai alamat yang bisa dibuka orang lain, misalnya situs yang sudah dipublish. Kosongkan kalau studio ini sudah dibuka lewat alamat publik.</p>
          <Input placeholder="https://situsmu.lovable.app" value={publicUrl} onChange={(e) => actions.updateSettings({ publicUrl: e.target.value })} />
          <p className="break-all text-xs text-muted-foreground">Contoh link yang terbentuk: {(publicUrl.trim() || "alamat halaman ini").replace(/\/+$/, "")}/live/kode-kamu</p>
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
          <p className="text-muted-foreground">Total diamond gift per penonton (dalam sesi ini) menentukan tier. Tier tampil sebagai lencana di feed dan Top Gifter, dan kenaikan tier diumumkan lewat banner.</p>
          <div className="grid grid-cols-3 gap-2">
            {(["⭐ Supporter", "💎 VIP", "👑 Sultan"] as const).map((label, i) => (
              <label key={label} className="text-xs">{label} ≥
                <NumberField commit="blur" min={i === 0 ? LIMITS.vipDiamonds.min : vipTiers[i - 1]! + 1} max={LIMITS.vipDiamonds.max} value={vipTiers[i]!} onChange={(n) => { const next = [...vipTiers] as [number, number, number]; next[i] = n; actions.updateSettings({ vipTiers: next }); }} />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Dalam diamond. Bawaan: 1 / 100 / 1000. Tombol Reset di panel Gift memulai hitungan dari nol.</p>
          <label className="flex items-center justify-between gap-2"><span>Notifikasi tiap gift di overlay</span>
            <input type="checkbox" className="h-4 w-4" checked={giftNotify} onChange={(e) => actions.updateSettings({ giftNotify: e.target.checked })} />
          </label>
        </Panel>

        <Panel className="space-y-3 text-sm">
          <h3 className="font-display text-sm font-bold">Antrean overlay</h3>
          <label className="flex items-center justify-between gap-2"><span>Pindah otomatis antar sesi</span>
            <input type="checkbox" className="h-4 w-4" checked={autoSwitchQueue} onChange={(e) => actions.updateSettings({ autoSwitchQueue: e.target.checked })} />
          </label>
          <p className="text-xs text-muted-foreground">Saat antrean satu jenis habis, lanjut ke jenis lain yang punya kiriman menunggu (yang “Lanjut otomatis”-nya hidup). Mati = sesi tetap menunggu input jenis yang sama.</p>
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

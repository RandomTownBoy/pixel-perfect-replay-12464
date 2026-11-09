import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          <p className="text-muted-foreground">Saat ini Demo Mode (tanpa API key). Tahap berikutnya memakai AI bawaan yang kuncinya disimpan aman di server — tidak pernah di browser.</p>
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
        <Panel className="space-y-2 text-sm">
          <h3 className="font-display text-sm font-bold">TikTok LIVE</h3>
          <p className="text-muted-foreground">Komentar & gift TikTok belum dibaca otomatis — TikTok belum menyediakan akses resmi untuk ini. Untuk sekarang hitung komentar dan tap gift lewat tombol Vote/Gift di pojok kanan bawah. Kami tidak akan pernah meminta password TikTok.</p>
        </Panel>
        <Panel className="space-y-2 text-sm md:col-span-2">
          <h3 className="font-display text-sm font-bold">Data Demo</h3>
          <Button variant="destructive" onClick={() => confirm("Reset semua data ke contoh awal?") && actions.resetDemo()}>Reset data demo</Button>
        </Panel>
      </div>
    </>
  );
}

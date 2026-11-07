import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, useKyoka } from "@/lib/kyoka";

export const Route = createFileRoute("/_studio/settings")({
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
        <Panel className="space-y-2 text-sm">
          <h3 className="font-display text-sm font-bold">TikTok LIVE</h3>
          <p className="text-muted-foreground">Belum tersambung. Semua kontrol manual dari dashboard. Kami tidak akan pernah meminta password TikTok.</p>
        </Panel>
        <Panel className="space-y-2 text-sm md:col-span-2">
          <h3 className="font-display text-sm font-bold">Data Demo</h3>
          <Button variant="destructive" onClick={() => confirm("Reset semua data ke contoh awal?") && actions.resetDemo()}>Reset data demo</Button>
        </Panel>
      </div>
    </>
  );
}

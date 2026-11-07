import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Play, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatusPill, useOverlayConnected } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { OverlayView } from "@/components/OverlayView";
import { Button } from "@/components/ui/button";
import { actions, defaultOverlay, readOverlay, resetOverlay, setOverlayVisible, subscribeOverlay, useKyoka, type OverlayState, type Settings } from "@/lib/kyoka";

export const Route = createFileRoute("/_studio/studio")({
  head: () => ({
    meta: [
      { title: "Overlay Studio — Kyoka Live Studio" },
      { name: "description", content: "Preview, customize and control the live overlay." },
      { property: "og:title", content: "Overlay Studio — Kyoka Live Studio" },
      { property: "og:description", content: "Control your livestream overlay." },
    ],
  }),
  component: Studio,
});

function Studio() {
  const connected = useOverlayConnected();
  const s = useKyoka((x) => x.settings);
  const [ov, setOv] = useState<OverlayState>(defaultOverlay());
  useEffect(() => { setOv(readOverlay()); return subscribeOverlay(setOv); }, []);
  const url = typeof window !== "undefined" ? `${window.location.origin}/overlay` : "/overlay";
  const ratio = s.overlayWidth / s.overlayHeight;

  return (
    <>
      <PageHeader title="Overlay Studio" sub="Kontrol overlay tanpa menyentuh jendela OBS."><StatusPill connected={connected} /></PageHeader>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel className="grid grid-cols-2 gap-2">
            <Button size="lg" variant="live" className="col-span-2" onClick={() => window.open("/overlay", "kyoka-overlay", "width=540,height=960")}><Play /> Start Overlay</Button>
            <Button size="lg" variant="secondary" onClick={() => setOverlayVisible(true)}><Eye /> Show</Button>
            <Button size="lg" variant="secondary" onClick={() => setOverlayVisible(false)}><EyeOff /> Hide</Button>
            <Button size="lg" variant="secondary" onClick={resetOverlay}><RotateCcw /> Reset</Button>
            <Button size="lg" variant="secondary" onClick={() => { navigator.clipboard.writeText(url); toast("URL overlay disalin"); }}><Copy /> Copy URL</Button>
            <a href="/overlay" target="_blank" rel="noreferrer" className="col-span-2 flex items-center gap-1 truncate text-xs text-muted-foreground"><ExternalLink className="h-3 w-3" />{url}</a>
          </Panel>
          <Panel className="space-y-4 text-sm">
            <h3 className="font-display text-sm font-bold">Kustomisasi</h3>
            <div className="flex gap-2">
              {(["purple", "blue", "pink", "yellow"] as Settings["accent"][]).map((a) => (
                <button key={a} aria-label={a} onClick={() => actions.updateSettings({ accent: a })}
                  className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-background ${s.accent === a ? "ring-2 ring-foreground" : ""} ${{ purple: "bg-primary", blue: "bg-electric", pink: "bg-pop", yellow: "bg-zest" }[a]}`} />
              ))}
            </div>
            <label className="block">Ukuran teks: {s.textScale.toFixed(1)}x
              <input type="range" min={0.7} max={1.6} step={0.1} value={s.textScale} onChange={(e) => actions.updateSettings({ textScale: +e.target.value })} className="w-full accent-primary" /></label>
            {([["showTitle", "Tampilkan judul gimmick"], ["showBadge", "Tampilkan badge KYOKA"], ["sound", "Efek suara"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center justify-between">{l}<input type="checkbox" checked={s[k]} onChange={(e) => actions.updateSettings({ [k]: e.target.checked })} /></label>
            ))}
            <div className="flex items-center gap-2">Ukuran
              <input type="number" value={s.overlayWidth} onChange={(e) => actions.updateSettings({ overlayWidth: +e.target.value || 1080 })} className="h-9 w-20 rounded-md border border-input bg-background px-2" />×
              <input type="number" value={s.overlayHeight} onChange={(e) => actions.updateSettings({ overlayHeight: +e.target.value || 1920 })} className="h-9 w-20 rounded-md border border-input bg-background px-2" />
            </div>
          </Panel>
          <Panel className="text-xs text-muted-foreground">
            <b className="text-foreground">Cara pakai di OBS:</b> tambah Browser Source, isi URL di atas, ukuran {s.overlayWidth}×{s.overlayHeight}. Di Demo Mode, sinkronisasi hanya bekerja antar-tab di browser yang sama — sinkronisasi lintas aplikasi (OBS) aktif setelah backend tersambung.
          </Panel>
        </div>
        <Panel>
          <h3 className="mb-3 font-display text-sm font-bold">Preview {ov.visible ? "" : "(disembunyikan)"}</h3>
          <div className="mx-auto overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: String(ratio), maxHeight: 640, backgroundImage: "repeating-conic-gradient(var(--muted) 0 25%, var(--background) 0 50%)", backgroundSize: "24px 24px", fontSize: 14 }}>
            <div className={ov.visible ? "" : "opacity-30"} style={{ height: "100%" }}><OverlayView state={{ ...ov, visible: true }} preview /></div>
          </div>
        </Panel>
      </div>
    </>
  );
}

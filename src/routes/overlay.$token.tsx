import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OverlayView, type SafeMode } from "@/components/OverlayView";
import { supabase } from "@/integrations/supabase/client";
import { defaultOverlay, type OverlayState } from "@/lib/kyoka";
import { startTimer, stopTimer } from "@/lib/ticker";

export const Route = createFileRoute("/overlay/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Kyoka Live Overlay" },
      { name: "description", content: "Transparent live overlay for browser capture." },
      { property: "og:title", content: "Kyoka Live Overlay" },
      { property: "og:description", content: "Transparent live overlay for browser capture." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overlay,
});

function Overlay() {
  const { token } = Route.useParams();
  const [state, setState] = useState<OverlayState | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("overlay-transparent");
    document.body.classList.add("overlay-transparent");
    let first = true;
    // Ambil state dari database. Setelah muatan pertama, hanya diterapkan kalau payloadAt/outro berbeda dari yang tampil.
    const resync = () => {
      supabase.rpc("get_overlay_state", { _token: token }).then(({ data, error }) => {
        if (error || data === null) { if (first) setInvalid(true); return; }
        const next = { ...defaultOverlay(), ...(data as Partial<OverlayState>) };
        first = false;
        // Database bisa tertinggal ~1 detik dari broadcast, jadi hanya terapkan kalau lebih baru dan benar-benar berbeda.
        setState((cur) => {
          if (!cur) return next;
          const differs = cur.payloadAt !== next.payloadAt || cur.outro?.at !== next.outro?.at || cur.visible !== next.visible || cur.updatedAt !== next.updatedAt;
          return differs && next.updatedAt >= cur.updatedAt ? next : cur;
        });
      });
    };
    resync();
    const ch = supabase.channel(`overlay-${token}`, { config: { presence: { key: `overlay-${crypto.randomUUID()}` } } });
    let subscribedOnce = false;
    ch.on("broadcast", { event: "state" }, ({ payload }) => setState({ ...defaultOverlay(), ...(payload as OverlayState) }))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        ch.track({ role: "overlay" });
        if (subscribedOnce) resync(); // tersambung ulang: kejar state yang terlewat
        subscribedOnce = true;
      });
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVisible);
    const poll = startTimer(resync, 30_000, true); // cadangan kalau broadcast terlewat
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVisible); stopTimer(poll); };
  }, [token]);

  // ?safe=tiktok (paksa zona aman 9:16) | ?safe=off (pakai seluruh area) | tanpa param = otomatis menurut rasio sumber.
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("safe") : null;
  const safe: SafeMode = q === "tiktok" || q === "off" ? q : "auto";

  if (invalid) return <div className="p-6 text-sm text-muted-foreground">Link overlay tidak valid atau sudah diganti.</div>;
  return (
    <div className="h-screen w-screen overflow-hidden overlay-transparent">
      <OverlayView state={state ?? defaultOverlay()} safe={safe} />
    </div>
  );
}

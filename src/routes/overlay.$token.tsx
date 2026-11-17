import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OverlayView, type SafeMode } from "@/components/OverlayView";
import { supabase } from "@/integrations/supabase/client";
import { defaultOverlay, type OverlayState } from "@/lib/kyoka";

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
    supabase.rpc("get_overlay_state", { _token: token }).then(({ data, error }) => {
      if (error || data === null) return setInvalid(true);
      setState({ ...defaultOverlay(), ...(data as Partial<OverlayState>) });
    });
    const ch = supabase.channel(`overlay-${token}`, { config: { presence: { key: `overlay-${crypto.randomUUID()}` } } });
    ch.on("broadcast", { event: "state" }, ({ payload }) => setState({ ...defaultOverlay(), ...(payload as OverlayState) }))
      .subscribe((status) => { if (status === "SUBSCRIBED") ch.track({ role: "overlay" }); });
    return () => { supabase.removeChannel(ch); };
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

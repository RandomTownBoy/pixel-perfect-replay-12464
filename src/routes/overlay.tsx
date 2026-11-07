import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OverlayView } from "@/components/OverlayView";
import { announceOverlay, defaultOverlay, readOverlay, subscribeOverlay, type OverlayState } from "@/lib/kyoka";

export const Route = createFileRoute("/overlay")({
  head: () => ({
    meta: [
      { title: "Kyoka Live Overlay" },
      { name: "description", content: "Transparent live overlay for Kyoka Live Studio." },
      { property: "og:title", content: "Kyoka Live Overlay" },
      { property: "og:description", content: "Transparent live overlay for browser capture." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overlay,
});

function Overlay() {
  const [state, setState] = useState<OverlayState | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("overlay-transparent");
    document.body.classList.add("overlay-transparent");
    setState(readOverlay());
    const off = subscribeOverlay(setState);
    const off2 = announceOverlay();
    return () => { off(); off2(); };
  }, []);
  return (
    <div className="h-screen w-screen overflow-hidden overlay-transparent" style={{ fontSize: "clamp(14px, 3.4vw, 40px)" }}>
      <OverlayView state={state ?? defaultOverlay()} />
    </div>
  );
}

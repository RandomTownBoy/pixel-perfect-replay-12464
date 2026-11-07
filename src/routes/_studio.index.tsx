import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Star, Radio } from "lucide-react";
import { PageHeader, StatusPill, useOverlayConnected } from "@/components/AppShell";
import { Panel } from "@/components/Gimmicks";
import { Button } from "@/components/ui/button";
import { GIMMICKS, setOverlayVisible, useKyoka } from "@/lib/kyoka";

export const Route = createFileRoute("/_studio/")({
  head: () => ({
    meta: [
      { title: "Kyoka Live Studio — Livestream Control Center" },
      { name: "description", content: "Run interactive TikTok LIVE gimmicks and control a live overlay from one dashboard." },
      { property: "og:title", content: "Kyoka Live Studio" },
      { property: "og:description", content: "Interactive livestream gimmicks, AI content and live overlays." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const name = useKyoka((s) => s.settings.creatorName);
  const questions = useKyoka((s) => s.questions);
  const activity = useKyoka((s) => s.activity);
  const connected = useOverlayConnected();
  const recent = [...questions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const favs = questions.filter((q) => q.favorite).slice(0, 5);

  const goLive = () => {
    window.open("/overlay", "kyoka-overlay", "width=540,height=960");
    setOverlayVisible(true);
  };

  return (
    <>
      <PageHeader title={`Halo, ${name} 👋`} sub="Siap bikin LIVE hari ini makin chaos?">
        <div className="flex items-center gap-3">
          <StatusPill connected={connected} />
          <Button size="lg" variant="live" onClick={goLive}><Radio /> Mulai Mode LIVE</Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {GIMMICKS.map((g) => (
          <Link key={g.id} to="/gimmicks" search={{ g: g.id }} className="group rounded-2xl border border-border bg-panel p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-glow">
            <div className="text-3xl transition group-hover:scale-110">{g.emoji}</div>
            <div className="mt-3 font-display text-sm font-bold">{g.name}</div>
            <div className="text-xs text-muted-foreground">{g.tagline}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel>
          <h3 className="mb-3 font-display text-sm font-bold">Baru dibuat</h3>
          <ul className="space-y-2 text-sm">{recent.map((q) => <li key={q.id} className="line-clamp-2 text-muted-foreground">{q.text}</li>)}</ul>
        </Panel>
        <Panel>
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold"><Star className="h-4 w-4 text-zest" /> Favorit</h3>
          {favs.length ? <ul className="space-y-2 text-sm">{favs.map((q) => <li key={q.id} className="line-clamp-2 text-muted-foreground">{q.text}</li>)}</ul>
            : <p className="text-sm text-muted-foreground">Tandai bintang di Question Bank.</p>}
        </Panel>
        <Panel>
          <h3 className="mb-3 font-display text-sm font-bold">Aktivitas</h3>
          <ul className="space-y-2 text-sm">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex justify-between gap-2"><span className="text-muted-foreground">{a.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground/70">{formatDistanceToNow(a.at)}</span></li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GIMMICKS } from "@/lib/kyoka";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kyoka Live Studio — Livestream Gimmick Control" },
      { name: "description", content: "Interactive TikTok LIVE gimmicks, audience voting, anonymous confessions and live overlays." },
      { property: "og:title", content: "Kyoka Live Studio" },
      { property: "og:description", content: "Run interactive livestream gimmicks with your audience." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-party font-display text-3xl font-black shadow-pop animate-float">K</span>
      <div>
        <h1 className="text-4xl font-black md:text-6xl"><span className="text-gradient">KYOKA</span> LIVE STUDIO</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">Gimmick LIVE yang bikin penonton ikut main — vote, confess anonim, dan gift yang ngaruh.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {GIMMICKS.map((g) => <span key={g.id} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">{g.emoji} {g.name}</span>)}
      </div>
      <Button asChild size="lg" variant="live"><Link to="/dashboard">Masuk ke Dashboard</Link></Button>
    </div>
  );
}

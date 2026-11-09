import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { GIMMICK_COMPONENTS } from "@/components/Gimmicks";
import { GIMMICKS, type GimmickId } from "@/lib/kyoka";

export const Route = createFileRoute("/_authenticated/_studio/gimmicks")({
  validateSearch: (s: { g?: GimmickId | undefined }): { g?: GimmickId | undefined } => ({
    g: GIMMICKS.some((x) => x.id === s.g) ? s.g : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Gimmicks — Kyoka Live Studio" },
      { name: "description", content: "Run six interactive livestream gimmicks." },
      { property: "og:title", content: "Gimmicks — Kyoka Live Studio" },
      { property: "og:description", content: "Spin the Question, This or That, Pick a Card and more." },
    ],
  }),
  component: GimmicksPage,
});

function GimmicksPage() {
  const { g = "spin" } = Route.useSearch();
  const nav = useNavigate({ from: "/gimmicks" });
  const Comp = GIMMICK_COMPONENTS[g];
  return (
    <>
      <PageHeader title="Gimmicks" sub="Pilih gimmick, siapkan, lalu kirim ke overlay." />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {GIMMICKS.map((x) => (
          <button key={x.id} onClick={() => nav({ search: { g: x.id } })}
            className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${g === x.id ? "border-primary bg-primary/15 shadow-glow" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            {x.emoji} {x.name}
          </button>
        ))}
      </div>
      <Comp key={g} />
    </>
  );
}

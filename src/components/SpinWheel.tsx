import type { CSSProperties } from "react";

/** Warna segmen roda: dipakai dashboard dan overlay supaya identik. */
export const WHEEL_COLORS = ["var(--primary)", "var(--electric)", "var(--pop)", "var(--chart-5)", "var(--zest)"];
export const wheelColor = (i: number) => WHEEL_COLORS[i % WHEEL_COLORS.length]!;

/**
 * Roda SVG bernomor. `count` = jumlah segmen (0 = roda kosong, tampil satu segmen "?").
 * `winner` (opsional): segmen pemenang di-highlight, yang lain diredupkan (kelas ov-win / ov-dim di overlay.css).
 */
export function SpinWheelSvg({ count, className, style, winner }: { count: number; className?: string; style?: CSSProperties; winner?: number | undefined }) {
  const empty = count <= 0;
  const n = empty ? 1 : count;
  const labelSize = n > 120 ? 3 : n > 60 ? 5 : n > 30 ? 8 : 14;
  const dividerWidth = n > 60 ? 0.35 : n > 30 ? 0.7 : 1.5;
  return (
    <svg viewBox="-100 -100 200 200" className={className} style={style}>
      {Array.from({ length: n }).map((_, i) => {
        const seg = (2 * Math.PI) / n; const a0 = i * seg - Math.PI / 2; const a1 = a0 + seg;
        const large = seg > Math.PI ? 1 : 0;
        const d = n === 1 ? "M0,-98 A98,98 0 1,1 -0.01,-98 Z" : `M0,0 L${98 * Math.cos(a0)},${98 * Math.sin(a0)} A98,98 0 ${large},1 ${98 * Math.cos(a1)},${98 * Math.sin(a1)} Z`;
        const cls = winner === undefined ? undefined : i === winner ? "ov-win" : "ov-dim";
        return (
          <g key={i} className={cls}>
            <path d={d} style={{ fill: empty ? "var(--muted)" : wheelColor(i) }} stroke="var(--background)" strokeWidth={dividerWidth} />
            <text x={60 * Math.cos(a0 + seg / 2)} y={60 * Math.sin(a0 + seg / 2)} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight="800" style={{ fill: "var(--background)" }}>{empty ? "?" : i + 1}</text>
          </g>
        );
      })}
      <circle r="16" style={{ fill: "var(--background)" }} />
    </svg>
  );
}

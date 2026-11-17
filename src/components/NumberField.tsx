import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { clampInt } from "@/lib/limits";

/**
 * Input bilangan bulat yang aman diedit:
 * - boleh dikosongkan saat mengetik (tidak langsung berubah jadi 1/default);
 * - hanya angka (tanpa minus, titik, atau "e");
 * - lebih dari `max` langsung dijepit ke `max`; kurang dari `min` dijepit saat selesai mengedit (blur / Enter);
 * - kalau dibiarkan kosong, kembali ke nilai sebelumnya, bukan ke default.
 * `commit="blur"` = nilai baru baru dikirim saat selesai mengedit (untuk field yang saling bergantung, mis. tier VIP).
 */
export function NumberField({ value, onChange, min, max, commit = "live", className, disabled, ...rest }: {
  value: number; onChange: (n: number) => void; min: number; max: number; commit?: "live" | "blur";
  className?: string; disabled?: boolean; id?: string; "aria-label"?: string; title?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // Nilai dari luar (mis. dijepit oleh batas lain) ikut tampil, kecuali saat pengguna sedang mengetik.
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);

  const finish = () => {
    focused.current = false;
    if (draft.trim() === "") { setDraft(String(value)); return; }
    const n = clampInt(draft, min, max, value);
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  const step = (d: number) => {
    const base = draft.trim() === "" ? value : clampInt(draft, min, max, value);
    const n = clampInt(base + d, min, max, value);
    setDraft(String(n)); if (n !== value) onChange(n);
  };

  return (
    <Input
      {...rest}
      type="text" inputMode="numeric" autoComplete="off" disabled={disabled}
      value={draft} className={className}
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onChange={(e) => {
        let d = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (d !== "" && Number(d) > max) d = String(max);
        setDraft(d);
        if (commit === "live" && d !== "") { const n = Number(d); if (n >= min && n <= max && n !== value) onChange(n); }
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.currentTarget.blur(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); step(1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
      }}
    />
  );
}

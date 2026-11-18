import { toast as base } from "sonner";

/**
 * Pembungkus toast: pesan teks yang sama memakai id yang sama, jadi notifikasi lama diperbarui
 * (waktu tampilnya diperpanjang) dan tidak menumpuk saat tombol ditekan berulang.
 */
type Fn = (message: never, data?: { id?: string | number }) => string | number;
const dedupe = (kind: string, fn: Fn) => (message: unknown, data?: { id?: string | number }) =>
  fn(message as never, typeof message === "string" ? { ...data, id: data?.id ?? `${kind}:${message}` } : data);

export const toast = Object.assign(dedupe("n", base as unknown as Fn), base, {
  success: dedupe("success", base.success as unknown as Fn),
  error: dedupe("error", base.error as unknown as Fn),
  info: dedupe("info", base.info as unknown as Fn),
  warning: dedupe("warning", base.warning as unknown as Fn),
  message: dedupe("message", base.message as unknown as Fn),
}) as unknown as typeof base;

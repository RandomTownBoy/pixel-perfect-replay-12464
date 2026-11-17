import { useCallback, useSyncExternalStore } from "react";

/**
 * State UI dashboard yang bertahan saat pindah halaman (mis. Gimmicks → Overlay Studio → Gimmicks) dan saat refresh.
 * Disimpan di memori modul (tidak ikut hilang saat komponen di-unmount) dan di localStorage.
 * Hanya key yang pernah diubah pengguna yang disimpan; selebihnya tetap memakai nilai awal dari kode.
 */
const STORE_KEY = "kyoka:ui:v1";
const mem = new Map<string, unknown>();
const persisted = new Set<string>();
const serverSeed = new Map<string, unknown>();
const subs = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) { mem.set(k, v); persisted.add(k); }
  } catch { /* abaikan data rusak */ }
}
function save() {
  try {
    const out: Record<string, unknown> = {};
    for (const k of persisted) out[k] = mem.get(k);
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch { /* abaikan */ }
}
const subscribe = (l: () => void) => { subs.add(l); return () => { subs.delete(l); }; };

/**
 * Seperti useState, tapi nilainya hidup di luar komponen. Setter tetap berfungsi walau komponen sudah di-unmount
 * (berguna untuk timer yang selesai setelah host pindah halaman). `volatile` = hanya di memori, tidak ke localStorage.
 */
export function usePersistedState<T>(key: string, initial: T, opts?: { volatile?: boolean }): [T, (v: T | ((prev: T) => T)) => void] {
  const volatile = !!opts?.volatile;
  const value = useSyncExternalStore(
    subscribe,
    () => {
      load();
      if (!mem.has(key)) mem.set(key, initial); // seed supaya snapshot stabil (objek inline tidak bikin loop render)
      return mem.get(key) as T;
    },
    () => {
      if (!serverSeed.has(key)) serverSeed.set(key, initial);
      return serverSeed.get(key) as T;
    },
  );
  const set = useCallback((v: T | ((prev: T) => T)) => {
    load();
    const prev = (mem.has(key) ? mem.get(key) : initial) as T;
    const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
    if (Object.is(prev, next)) return;
    mem.set(key, next);
    if (!volatile) { persisted.add(key); save(); }
    subs.forEach((l) => l());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, volatile]);
  return [value, set];
}

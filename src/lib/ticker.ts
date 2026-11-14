/**
 * Timer yang tidak diperlambat browser saat tab dashboard tersembunyi atau tertutup jendela lain.
 * Browser membatasi setTimeout/setInterval di tab latar (bahkan sampai 1x per menit setelah 5 menit),
 * padahal antrean overlay, banner gift, dan pengiriman vote bergantung pada timer.
 * Timer di Web Worker tidak ikut dibatasi. Kalau Worker tidak tersedia, otomatis memakai timer biasa.
 */
type Cb = () => void;
export type TimerHandle = { id: number; native?: ReturnType<typeof setTimeout> };

let worker: Worker | null = null;
let workerFailed = false;
let seq = 0;
const registry = new Map<number, { cb: Cb; repeat: boolean }>();

const WORKER_SRC = `
const t = new Map();
onmessage = (e) => {
  const m = e.data;
  if (m.op === 'start') {
    const fire = () => postMessage(m.id);
    t.set(m.id, m.repeat ? setInterval(fire, m.ms) : setTimeout(() => { t.delete(m.id); fire(); }, m.ms));
  } else if (m.op === 'stop') {
    const h = t.get(m.id);
    if (h !== undefined) { clearTimeout(h); clearInterval(h); t.delete(m.id); }
  }
};`;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerFailed || typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return null;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    worker.onmessage = (e: MessageEvent<number>) => {
      const r = registry.get(e.data);
      if (!r) return;
      if (!r.repeat) registry.delete(e.data);
      r.cb();
    };
    worker.onerror = () => { workerFailed = true; worker = null; };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function startTimer(cb: Cb, ms: number, repeat = false): TimerHandle {
  const w = getWorker();
  const id = ++seq;
  if (w) {
    registry.set(id, { cb, repeat });
    w.postMessage({ op: "start", id, ms, repeat });
    return { id };
  }
  return { id, native: (repeat ? setInterval(cb, ms) : setTimeout(cb, ms)) as ReturnType<typeof setTimeout> };
}

export function stopTimer(h: TimerHandle | null | undefined) {
  if (!h) return;
  if (h.native !== undefined) { clearTimeout(h.native); clearInterval(h.native); return; }
  registry.delete(h.id);
  worker?.postMessage({ op: "stop", id: h.id });
}

import { useEffect, useRef, useState } from 'react';
import { setModel } from '../sim/model';
import type { WorkerMessage } from '../sim/train.worker';

/**
 * Runs the full training pipeline (simulate episodes → fit → evaluate) in a
 * Web Worker and hot-swaps the live detection model — the browser equivalent
 * of `npm run train`, so the demo works on static hosting.
 */
export default function TrainButton() {
  const [status, setStatus] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const start = () => {
    if (workerRef.current) return;
    setStatus('starting…');
    const worker = new Worker(new URL('../sim/train.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        const p = msg.progress;
        setStatus(
          p.phase === 'simulate'
            ? `simulating ${p.episode}/${p.episodes}`
            : `fitting ${p.epoch}/${p.epochs}`,
        );
      } else {
        setModel(msg.model);
        worker.terminate();
        workerRef.current = null;
        setStatus(null);
        const healthy = Math.round(msg.model.recall[0] * 100);
        setFlash(`model updated ✓ (healthy recall ${healthy}%)`);
        setTimeout(() => setFlash(null), 6000);
      }
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setStatus(null);
      setFlash('training failed');
      setTimeout(() => setFlash(null), 6000);
    };
    worker.postMessage('start');
  };

  return (
    <span className="train-wrap">
      <button
        className="why-button"
        disabled={status !== null}
        onClick={start}
        title="Re-run the full training pipeline (12 simulated episodes → logistic regression) in a Web Worker and hot-swap the detection model"
      >
        {status ? `Training: ${status}` : 'Retrain model'}
      </button>
      {flash && <span className="train-flash">{flash}</span>}
    </span>
  );
}

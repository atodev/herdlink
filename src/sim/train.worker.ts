import { trainModel } from './trainer';
import type { TrainedModel, TrainProgress } from './trainer';

/**
 * Web Worker wrapper for the training pipeline, so the UI's "Retrain model"
 * button can run the full simulate → fit → evaluate loop off the main thread.
 */

export type WorkerMessage =
  | { type: 'progress'; progress: TrainProgress }
  | { type: 'done'; model: TrainedModel };

self.onmessage = () => {
  const model = trainModel((progress) => {
    self.postMessage({ type: 'progress', progress } satisfies WorkerMessage);
  });
  self.postMessage({ type: 'done', model } satisfies WorkerMessage);
};

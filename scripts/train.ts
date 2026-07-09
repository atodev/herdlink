/**
 * Offline trainer for the detection model — thin node wrapper around the
 * shared pipeline in src/sim/trainer.ts (the same code the UI's "Retrain
 * model" button runs in a Web Worker). Writes src/sim/model.json, which is
 * bundled into the app as the default model.
 *
 *   npm run train
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, trainModel } from '../src/sim/trainer';

const model = trainModel((p) => {
  if (p.phase === 'simulate') console.log(`episode ${p.episode}/${p.episodes} — ${p.rows} rows`);
  else console.log(`epoch ${p.epoch}/${p.epochs}  loss ${p.loss.toFixed(4)}`);
});

console.log('\nheld-out recall:');
CLASSES.forEach((c, i) => console.log(`  ${c.padStart(8)}  ${(model.recall[i] * 100).toFixed(1)}%`));

const dest = join(dirname(fileURLToPath(import.meta.url)), '../src/sim/model.json');
writeFileSync(dest, JSON.stringify(model, null, 2));
console.log(`\nwrote ${dest}`);

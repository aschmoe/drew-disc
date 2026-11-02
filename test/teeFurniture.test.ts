import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, TEE_FURNITURE } from '../client/src/content/hole';

const dir = 'client/public/courses/seatac/holes';

describe('tee furniture', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`nothing grows through the tee sign or the wind flag on ${file}`, () => {
      const hole = buildHole(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
      const tee = hole.def.tees[0].pos;
      for (const [name, f] of Object.entries(TEE_FURNITURE)) {
        for (const t of hole.trees) {
          // At sign height a bush is all canopy; a tree is only its trunk (its crown is overhead).
          const reach = t.kind === 'bush' ? t.canopyRx : t.trunkRadius;
          const d = Math.hypot(t.x - (tee[0] + f.dx), -t.z - (tee[1] + f.dy));
          expect(d, `${t.kind} at (${t.x.toFixed(1)}, ${(-t.z).toFixed(1)}) vs the ${name}`).toBeGreaterThan(reach + 0.3);
        }
      }
    });
  }
});

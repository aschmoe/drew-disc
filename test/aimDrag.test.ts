import { describe, expect, it } from 'vitest';
import { AIM_DEG_PER_WIDTH, aimDragDelta } from '../client/src/ui/aimDrag';

describe('scene drag', () => {
  it('turns the aim 45 degrees across the full width, with no launch change', () => {
    const d = aimDragDelta(390, 0, 390);
    expect(d.aimDeg).toBeCloseTo(AIM_DEG_PER_WIDTH);
    expect(d.launchDeg).toBeCloseTo(0);
  });

  it('dragging up raises the launch and down lowers it, with no aim change', () => {
    expect(aimDragDelta(0, -100, 390).launchDeg).toBeGreaterThan(0);
    expect(aimDragDelta(0, 100, 390).launchDeg).toBeLessThan(0);
    expect(aimDragDelta(0, 100, 390).aimDeg).toBe(0);
  });

  it('moves the launch a half to two thirds as much per pixel as the aim', () => {
    const across = aimDragDelta(100, 0, 800).aimDeg;
    const up = aimDragDelta(0, -100, 800).launchDeg;
    expect(up / across).toBeGreaterThanOrEqual(0.5);
    expect(up / across).toBeLessThanOrEqual(2 / 3);
  });

  it('a pixel is worth the same on any screen size relative to its width', () => {
    expect(aimDragDelta(0, -39, 390).launchDeg).toBeCloseTo(aimDragDelta(0, -144, 1440).launchDeg);
  });
});

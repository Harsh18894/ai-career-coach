import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrajectoryHero, COMPACT, WIDE, type Geometry } from './Trajectory';
import { HERO_DESTINATIONS } from '@/components/landing/SampleData';

/* =====================================================================================
 * The mobile preset exists for one reason: at 375px the destination labels were being cut off
 * ("Revenue Operations Manager" -> "Revenue Opera…"). So that is what is tested — that every
 * label has room INSIDE the compact viewBox, where nothing downstream can clip it.
 *
 * SVG <text> does not wrap and does not shrink, and there is no layout engine in jsdom to ask,
 * so the width is estimated. The estimate is deliberately pessimistic and stated as a constant
 * below: the point is not to predict the pixel, it is to fail loudly if someone adds a longer
 * sample title than the geometry was designed around.
 * ===================================================================================== */

/**
 * Advance width per character as a fraction of font size, for Geist Sans at weight 600.
 *
 * Mixed-case Latin averages nearer 0.55; 0.62 is chosen to sit above that so the assertion has
 * headroom against a label of unusually wide characters. If a real measurement ever contradicts
 * this, change the number here rather than the geometry.
 */
const CHAR_WIDTH_RATIO = 0.62;

function estimatedLabelWidth(label: string, fontSize: number): number {
  return label.length * CHAR_WIDTH_RATIO * fontSize;
}

/** The x at which a label ends, in viewBox units. */
function labelRightEdge(label: string, g: Geometry): number {
  return g.destX + g.labelGap + estimatedLabelWidth(label, g.fontSize);
}

const labels = HERO_DESTINATIONS.map((d) => d.label);
const longest = labels.reduce((a, b) => (a.length >= b.length ? a : b));

describe('compact (mobile) geometry', () => {
  it('has real labels to test against', () => {
    expect(labels.length).toBe(3);
    expect(longest.length).toBeGreaterThan(20);
  });

  it.each(labels)('fits "%s" inside the viewBox', (label) => {
    expect(labelRightEdge(label, COMPACT)).toBeLessThanOrEqual(COMPACT.width - COMPACT.padRight);
  });

  it('is narrower than the wide preset — that is what buys the label its room', () => {
    expect(COMPACT.destX).toBeLessThan(WIDE.destX);
    expect(COMPACT.width - COMPACT.destX).toBeGreaterThan(WIDE.width - WIDE.destX);
  });

  it('uses a larger type size than the wide preset, to survive being scaled down', () => {
    // The compact viewBox is scaled to a ~343px container, so 15 units renders near 12px. At the
    // wide preset's 13 it would land near 10px, which is below what this is willing to ship.
    expect(COMPACT.fontSize).toBeGreaterThan(WIDE.fontSize);
  });

  it('draws its branches forward, never doubling back', () => {
    // The curve control points used to be fixed offsets tuned to the wide span. At the compact
    // span, `destX - 90` sits left of branchX and the line loops backwards.
    for (const g of [COMPACT, WIDE]) {
      const span = g.destX - g.branchX;
      expect(g.branchX + span * (70 / 220)).toBeGreaterThan(g.branchX);
      expect(g.destX - span * (90 / 220)).toBeGreaterThan(g.branchX);
    }
  });

  it('has a dash long enough to hide the branch before it draws on', () => {
    for (const g of [COMPACT, WIDE]) {
      // Straight-line lower bound on the path length; the curve is longer, hence the margin.
      const minPathLength = g.destX - g.originX;
      expect(g.dashLength).toBeGreaterThan(minPathLength);
    }
  });
});

describe('TrajectoryHero rendering', () => {
  it('renders both presets so the swap is CSS, not a measurement', () => {
    const { container } = render(<TrajectoryHero destinations={HERO_DESTINATIONS} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute('class')).toContain('sm:hidden');
    expect(svgs[1].getAttribute('class')).toContain('hidden sm:block');
  });

  it('leaves both diagrams in the accessibility tree for CSS to resolve', () => {
    // aria-hidden would be wrong here: which preset is visible depends on the viewport, and the
    // attribute cannot. display:none does the hiding, per viewport, on its own.
    const { container } = render(<TrajectoryHero destinations={HERO_DESTINATIONS} />);
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.hasAttribute('aria-hidden')).toBe(false);
    }
  });

  it('names every destination in each diagram, so either one describes the same thing', () => {
    render(<TrajectoryHero destinations={HERO_DESTINATIONS} />);
    for (const label of labels) {
      // One button per preset.
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(2);
    }
  });

  it('starts with no destination selected, and says how to reveal one', () => {
    render(<TrajectoryHero destinations={HERO_DESTINATIONS} />);
    expect(screen.getByText(/tap a destination to see why it is there/i)).toBeInTheDocument();
  });
});

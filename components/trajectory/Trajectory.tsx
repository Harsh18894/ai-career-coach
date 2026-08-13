'use client';

import React, { useId, useState } from 'react';

/* =====================================================================================
 * The trajectory: one dot, branching lines, destinations.
 *
 * This is the product's actual shape — you are here, these are the directions, here is the
 * plan — so it carries the visual identity. It is built from real geometry rather than a stock
 * illustration, and it is reused at every scale: hero, path cards, roadmap, empty states.
 *
 * WHAT THE DESTINATIONS SHOW, AND WHAT THEY DELIBERATELY DO NOT.
 *
 * They show `tier` (conservative / realistic / ambitious) and the ambition check's verdict,
 * because those are the two calibration signals a real path actually carries — see
 * CareerPathSchema in lib/ai/schemas.ts.
 *
 * There is no "84% fit" here, and that is not an oversight. The product has no fit score:
 * lib/resume-review/schemas.ts records the decision as "deliberately NO numeric score field",
 * and putting a fabricated percentage on the landing page would advertise a capability that
 * does not exist. It would also produce precisely the "an AI scanned my resume and gave me a
 * score" impression the positioning rules out. Tier and ambition are more honest AND more
 * interesting: "realistic, and your evidence supports it" says more than a number.
 * ===================================================================================== */

export type TrajectoryTier = 'conservative' | 'realistic' | 'ambitious';

export type Destination = {
  id: string;
  label: string;
  tier: TrajectoryTier;
  /** The ambition check's own words, shortened. Real copy, not a rating. */
  calibration: string;
  /** One concrete thing from the background this points at. */
  evidence: string;
};

const TIER_LABEL: Record<TrajectoryTier, string> = {
  conservative: 'Conservative',
  realistic: 'Realistic',
  ambitious: 'Ambitious',
};

/** Vertical positions for up to three destinations, as a fraction of the viewBox height. */
const ROWS = [0.16, 0.5, 0.84];

/* -------------------------------------------------------------------------------------
 * Geometry
 *
 * Two presets, because one does not fit both. The destination labels are SVG <text>, which
 * does not wrap and does not shrink — so the space they need has to exist in the viewBox.
 *
 * The wide preset deliberately lets its labels sit PAST the 520-unit viewBox and relies on
 * `overflow-visible` to paint them; there is room in the hero's grid column for that. At 375px
 * there is no room, and the page edge cut "Revenue Operations Manager" to "Revenue Opera…".
 *
 * So the compact preset shortens the diagram itself — a shorter trunk and nearer destinations —
 * to buy the label the width it needs INSIDE the viewBox, where nothing can clip it. Same
 * drawing, same interaction; only the proportions change.
 * ----------------------------------------------------------------------------------- */
export type Geometry = {
  width: number;
  height: number;
  originX: number;
  branchX: number;
  destX: number;
  /** Distance from the destination node to the start of its label. */
  labelGap: number;
  fontSize: number;
  /** Right-hand breathing room the label must not cross. Asserted in Trajectory.test.ts. */
  padRight: number;
  /** Dash length for the draw-on animation. Must exceed the longest branch path. */
  dashLength: number;
};

export const WIDE: Geometry = {
  width: 520,
  height: 340,
  originX: 54,
  branchX: 210,
  destX: 430,
  labelGap: 20,
  fontSize: 13,
  padRight: 0,
  dashLength: 620,
};

export const COMPACT: Geometry = {
  width: 420,
  height: 320,
  originX: 30,
  branchX: 70,
  destX: 110,
  labelGap: 16,
  fontSize: 15,
  padRight: 8,
  dashLength: 220,
};

/**
 * The hero trajectory. Interactive: hovering or focusing a destination raises a small card.
 *
 * Keyboard reachable — each node is a real <button>, so the same information is available
 * without a pointer. An SVG that only responds to hover would put the most explanatory element
 * on the page out of reach of anyone tabbing through it.
 */
function TrajectoryDiagram({
  items,
  geometry,
  active,
  setActive,
  cardId,
  className,
}: {
  items: Destination[];
  geometry: Geometry;
  active: string | null;
  setActive: React.Dispatch<React.SetStateAction<string | null>>;
  cardId: string;
  className: string;
}) {
  const { width, height, originX, branchX, destX, labelGap, fontSize } = geometry;
  const originY = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full h-auto overflow-visible ${className}`}
      role="img"
      // Deliberately NOT aria-hidden on the inactive preset: which one that is depends on the
      // viewport, and this attribute cannot. `display:none` from the Tailwind class already
      // removes the hidden one from the accessibility tree, and unlike aria-hidden it is
      // evaluated per viewport — so exactly one diagram and one set of node buttons is ever
      // announced, whichever that happens to be.
      aria-label={`A career trajectory branching from where you are today into ${items.length} directions: ${items.map((d) => d.label).join(', ')}.`}
    >
        {items.map((dest, i) => {
          const y = height * ROWS[i];
          // Trunk out, then a curve into each destination row. One shared trunk keeps the
          // "single origin" reading — three separate lines from the dot would look like three
          // unrelated options rather than three branches of one career.
          //
          // The control points are fractions of the branch span rather than fixed offsets. As
          // constants they were tuned to the wide preset, and at compact scale `destX - 90`
          // lands LEFT of branchX — the curve would double back on itself. These fractions
          // reproduce the original 70 and 90 exactly when the span is the wide preset's 220.
          const span = destX - branchX;
          const d = `M ${originX} ${originY} H ${branchX} C ${branchX + span * (70 / 220)} ${originY}, ${destX - span * (90 / 220)} ${y}, ${destX} ${y}`;
          const isActive = active === dest.id;
          return (
            <path
              key={dest.id}
              d={d}
              fill="none"
              stroke={isActive ? 'var(--hachi)' : 'var(--border-soft)'}
              strokeWidth={isActive ? 2.5 : 1.75}
              strokeLinecap="round"
              className="trajectory-line transition-[stroke,stroke-width] duration-200"
              style={{
                strokeDasharray: geometry.dashLength,
                strokeDashoffset: geometry.dashLength,
                animationDelay: `${0.15 + i * 0.13}s`,
              }}
            />
          );
        })}

        {/* The user. The only continuously moving element on the page. */}
        <circle cx={originX} cy={originY} r="12" fill="var(--hachi)" opacity="0.14" />
        <circle cx={originX} cy={originY} r="6" fill="var(--hachi)" className="trajectory-you" />
        <text
          x={originX}
          y={originY + 30}
          textAnchor="middle"
          className="fill-ink-muted text-[11px] font-semibold tracking-[0.14em]"
        >
          YOU
        </text>

        {items.map((dest, i) => {
          const y = height * ROWS[i];
          const isActive = active === dest.id;
          return (
            <g
              key={dest.id}
              className="trajectory-node"
              style={{ animationDelay: `${0.75 + i * 0.13}s` }}
            >
              <foreignObject x={destX - 14} y={y - 14} width="28" height="28" overflow="visible">
                <button
                  type="button"
                  aria-describedby={isActive ? cardId : undefined}
                  onMouseEnter={() => setActive(dest.id)}
                  onMouseLeave={() => setActive((cur) => (cur === dest.id ? null : cur))}
                  onFocus={() => setActive(dest.id)}
                  onBlur={() => setActive((cur) => (cur === dest.id ? null : cur))}
                  className="grid h-7 w-7 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-hachi focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  <span className="sr-only">{dest.label}</span>
                  <span
                    aria-hidden="true"
                    className={`block rounded-full transition-all duration-200 ${
                      isActive ? 'h-3.5 w-3.5 bg-hachi' : 'h-2.5 w-2.5 bg-ink'
                    }`}
                  />
                </button>
              </foreignObject>

              <text
                x={destX + labelGap}
                y={y + 4}
                fontSize={fontSize}
                className={`font-semibold transition-colors duration-200 ${
                  isActive ? 'fill-ink' : 'fill-ink-muted'
                }`}
              >
                {dest.label}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

/**
 * The hero trajectory. Interactive: hovering or focusing a destination raises a small card.
 *
 * Keyboard reachable — each node is a real <button>, so the same information is available
 * without a pointer. An SVG that only responds to hover would put the most explanatory element
 * on the page out of reach of anyone tabbing through it.
 *
 * Both geometry presets are rendered and swapped with CSS rather than measured in JavaScript:
 * a media query resolves before first paint, so there is no flash of the wrong one and no
 * hydration mismatch. They share one `active` state, so the detail card below is written once
 * and behaves identically on either.
 */
export function TrajectoryHero({ destinations }: { destinations: Destination[] }) {
  const [active, setActive] = useState<string | null>(null);
  const uid = useId().replace(/:/g, '');
  const cardId = `${uid}-card`;

  const items = destinations.slice(0, 3);
  const activeItem = items.find((d) => d.id === active) ?? null;

  return (
    <div className="relative w-full">
      <TrajectoryDiagram
        items={items}
        geometry={COMPACT}
        active={active}
        setActive={setActive}
        cardId={cardId}
        className="sm:hidden"
      />
      <TrajectoryDiagram
        items={items}
        geometry={WIDE}
        active={active}
        setActive={setActive}
        cardId={cardId}
        className="hidden sm:block"
      />

      {/*
        The detail card is HTML, not SVG text: it wraps, it scales with the reader's font size,
        and it can be announced. Positioned in normal flow beneath the diagram so nothing
        overlaps and no layout shifts when it appears — a card that popped over the diagram
        would cover the very node being inspected.
      */}
      <div className="mt-3 min-h-[92px] sm:min-h-[84px]">
        {activeItem ? (
          <div
            id={`${uid}-card`}
            className="rise-in rounded-xl border border-border-soft bg-surface p-4 shadow-[0_1px_2px_rgba(17,17,17,0.04)]"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-semibold text-ink">{activeItem.label}</p>
              <span className="text-xs font-semibold uppercase tracking-wider text-hachi">
                {TIER_LABEL[activeItem.tier]}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{activeItem.calibration}</p>
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-hachi" />
              <span>{activeItem.evidence}</span>
            </p>
          </div>
        ) : (
          <p className="px-1 text-sm text-ink-muted">
            <span className="hidden sm:inline">Hover a destination to see why it is there.</span>
            <span className="sm:hidden">Tap a destination to see why it is there.</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The small inline version: a dot, a short line, a node. Used as a section marker and inside
 * cards, so the motif recurs without repeating the whole diagram.
 */
export function TrajectoryMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 12" className={className} aria-hidden="true" focusable="false">
      <circle cx="5" cy="6" r="4" fill="var(--hachi)" />
      <path d="M11 6 H33" stroke="var(--border-soft)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="38" cy="6" r="3.5" fill="var(--ink)" />
    </svg>
  );
}

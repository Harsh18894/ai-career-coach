import React from 'react';

/* The journey, in one line.
 *
 * Four words and a dot. It exists so the plan reads as the end of a deliberate process rather
 * than as a page that appeared — but it is navigation furniture, not content, so it gets one
 * row and no more. The completed stages are stated in text as well as marked, so the state is
 * never carried by colour alone. */
const STAGES = ['Profile', 'Explore', 'Choose', 'Plan'] as const;

export function PlanStages({ current = 3 }: { current?: number }) {
  return (
    <nav
      aria-label="Where you are"
      className="border-b border-border-soft bg-paper/80 px-5 py-2.5 backdrop-blur-sm sm:px-8"
    >
      <ol className="mx-auto flex max-w-3xl items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
        {STAGES.map((stage, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={stage} className="flex items-center gap-2">
              <span
                className={
                  active ? 'flex items-center gap-1.5 text-hachi' : done ? 'text-ink-muted' : 'text-ink-muted/50'
                }
              >
                {active && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-hachi" />}
                {stage}
                {done && (
                  <>
                    <span aria-hidden="true"> ✓</span>
                    <span className="sr-only"> (done)</span>
                  </>
                )}
                {active && <span className="sr-only"> (current)</span>}
              </span>
              {i < STAGES.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-border-soft sm:w-6" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

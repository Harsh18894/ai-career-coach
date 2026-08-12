import React from 'react';

/* =====================================================================================
 * The illustration system. Two figures. The budget is three.
 *
 * ------------------------------- WHY TWO, NOT THREE -------------------------------
 * The brief set three as a ceiling and said restraint is the requirement. The fold needs one,
 * and the waiting/empty/error states need one — that one earns its place, because it turns a
 * 30-second roadmap generation and a "today's budget is spent" message into something a person
 * can sit through.
 *
 * The optional third, in "How it works", was left out. That section sits directly above the
 * credibility argument, and a dog four hundred pixels from the sentence about the eval suite
 * pulls in exactly the wrong direction for the reader who is deciding whether this is serious
 * work. Nothing was gained by adding it, so it is not there.
 * ----------------------------------------------------------------------------------
 *
 * Execution notes, all of them load-bearing:
 *
 *  - ORIGINAL ARTWORK, built from primitives. Not traced from a photograph, not a likeness of a
 *    specific dog, not Doge, not any existing mascot or character. A generic friendly dog.
 *  - Inline SVG, flat, three colours from the app's existing indigo palette. No raster, no
 *    external file, no network request.
 *  - NOT an LCP candidate. Largest Contentful Paint only considers <img>, <video>, background
 *    images, <image> INSIDE an svg, and text blocks — a plain inline <svg> of <path> elements is
 *    none of those. So the fold illustration cannot become the LCP element, which is what
 *    Pass B's budget requires. This is why there is no <image> tag anywhere below.
 *  - aria-hidden with no title or desc. These carry no information; a screen reader that
 *    announced them would be reading out decoration.
 *  - Sized in relative units by the caller so they hold at 375px.
 *
 * On the Hachikō association: the warmth of "loyal companion" is the point. The story is not —
 * no waiting at a station, no statue, nothing melancholy. A dog sitting attentively next to you
 * while you think is the whole idea.
 * ===================================================================================== */

/** Three colours, from the palette already in use across the app. */
const COAT = '#c7d2fe'; // indigo-200 — body
const MARK = '#818cf8'; // indigo-400 — ears, muzzle, paws
const FEATURE = '#3730a3'; // indigo-800 — eye and nose only

/**
 * The fold companion. Seated, three-quarter view, head tilted, attention directed to the RIGHT —
 * toward the call to action and the sample output beside it, never out at the viewer.
 *
 * That direction is deliberate: a figure making eye contact with the reader is performing, and
 * the brief asked for attentive rather than performing. A figure looking at the thing you want
 * the reader to look at is doing useful work — gaze direction is one of the few reliable ways an
 * illustration can point without an arrow.
 */
export function HachiCompanion({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* Ground shadow — grounds the figure so it does not float. */}
      <ellipse cx="58" cy="131" rx="36" ry="5.5" fill={MARK} opacity="0.22" />

      {/* Tail, curled up behind the haunch. Drawn before the body so it tucks behind it. */}
      <path
        d="M26 104c-9-2-14-9-12-17 1.6-6.4 7-9 11-7 3.4 1.7 3.6 6 1 8-2 1.6-4.6.6-5-1.6"
        fill="none"
        stroke={MARK}
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Haunch and body: one seated mass, narrow at the shoulder, wide at the base. */}
      <path
        d="M40 122c-14 0-22-9-22-24 0-16 7-28 18-33 6-3 12-3 17-1 6 2 10 7 12 14 3 10 3 24 1 33-1.4 6.6-5 11-11 11z"
        fill={COAT}
      />

      {/* Two front legs, the near one slightly forward. */}
      <path d="M56 100c4.5 0 7.5 3 7.5 8v14c0 2.6-1.8 4-4.2 4h-6.6c-2.4 0-4.2-1.4-4.2-4v-14c0-5 3-8 7.5-8z" fill={COAT} />
      <path d="M74 102c4.2 0 7 2.8 7 7.4V122c0 2.4-1.7 3.8-4 3.8h-6c-2.3 0-4-1.4-4-3.8v-12.6c0-4.6 2.8-7.4 7-7.4z" fill={COAT} />
      {/* Paws — the one place a second tone adds definition without adding detail. */}
      <path d="M49 118h13.4c1 0 1.6.8 1.6 2v2c0 2.6-1.8 4-4.2 4h-6.6c-2.4 0-4.2-1.4-4.2-4v-2c0-1.2.6-2 1.6-2z" fill={MARK} />
      <path d="M67 119.4h12.6c.9 0 1.4.8 1.4 1.9v.7c0 2.4-1.7 3.8-4 3.8h-6c-2.3 0-4-1.4-4-3.8v-.7c0-1.1.5-1.9 1.4-1.9z" fill={MARK} />

      {/*
        Head group, rotated 9 degrees. The tilt is the entire expression — there is no mouth,
        no eyebrow, no blush. A tilted head with one visible eye reads as "listening" at any
        size, and reads the same at 40px as at 400px, which nothing more detailed does.
      */}
      <g transform="rotate(9 78 52)">
        {/* Far ear, behind the skull. */}
        <path d="M62 30c-7 1-11 8-9.6 16 1 5.6 4 9.6 7.6 11z" fill={MARK} />

        {/* Skull. */}
        <ellipse cx="78" cy="52" rx="24" ry="22" fill={COAT} />

        {/* Muzzle, extending toward the right — where the attention goes. */}
        <ellipse cx="97" cy="58" rx="13" ry="9.5" fill={MARK} />
        <circle cx="106.5" cy="55.5" r="3.4" fill={FEATURE} />

        {/* Near ear, dropped and forward. */}
        <path d="M66 28c-8.4 1.4-13 9-11 18.6 1.3 6.4 4.8 11 9 12.6z" fill={MARK} />

        {/* One eye. A second eye in three-quarter view either crowds the muzzle or forces a
            level of modelling this style does not have. */}
        <circle cx="86" cy="47" r="3.1" fill={FEATURE} />
      </g>
    </svg>
  );
}

/**
 * The reusable state figure: waiting, empty, error, and "today's demo budget is spent".
 *
 * Lying down with head on paws — settled rather than eager, because every state that uses this
 * is one where the honest message is "this will take a moment" or "not today". A bouncing,
 * cheerful figure next to a failure is the thing that makes people angrier.
 *
 * `animate` opts into a single slow tail movement, for waits only. Everything else gets it
 * static. Under prefers-reduced-motion the animation is switched off in globals.css.
 */
export function HachiResting({
  className = '',
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 140 90"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <ellipse cx="70" cy="82" rx="46" ry="5" fill={MARK} opacity="0.22" />

      {/* Tail. The one moving part, and only when asked. */}
      <path
        d="M22 66c-8 1-13-3-13-9 0-5 4-8 8-7 3.4.9 4.4 4.4 2.6 6.6"
        fill="none"
        stroke={MARK}
        strokeWidth="6"
        strokeLinecap="round"
        className={animate ? 'hachi-tail' : undefined}
      />

      {/* Reclining body. */}
      <path d="M30 76c-8 0-13-5-13-13 0-11 8-19 20-21 14-2.4 30-1 42 3 8 2.6 12 7 12 13 0 11-7 18-19 18z" fill={COAT} />

      {/* Head, resting low and forward. */}
      <ellipse cx="100" cy="56" rx="22" ry="19" fill={COAT} />
      <ellipse cx="117" cy="61" rx="11" ry="8" fill={MARK} />
      <circle cx="125" cy="59" r="3" fill={FEATURE} />
      {/* Dropped ear. */}
      <path d="M88 40c-7.6 1-12 7.4-10.4 15.4 1 5.2 4 9 7.6 10.4z" fill={MARK} />
      {/* Eye, a closed arc rather than a dot — settled, not asleep. */}
      <path d="M104 52.5c1.8-1.8 4.6-1.8 6.4 0" fill="none" stroke={FEATURE} strokeWidth="2.4" strokeLinecap="round" />

      {/* Front paws, crossed under the chin. */}
      <path d="M86 70h22c1.2 0 2 .9 2 2.2s-.8 2.2-2 2.2H86c-1.2 0-2-.9-2-2.2s.8-2.2 2-2.2z" fill={MARK} />
      <path d="M80 76h24c1.2 0 2 .9 2 2.2s-.8 2.2-2 2.2H80c-1.2 0-2-.9-2-2.2s.8-2.2 2-2.2z" fill={MARK} />
    </svg>
  );
}

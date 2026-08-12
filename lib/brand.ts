/**
 * The product's identity, in one place.
 *
 * Everything user-visible reads from here rather than hardcoding the name. Before this, "Aria"
 * appeared as a literal in ten files including four error messages and a system prompt, so
 * renaming meant finding every one of them — which is exactly the job this constant exists to
 * make unnecessary next time.
 *
 * Dependency-free on purpose: lib/errors.ts imports it and is itself imported by client
 * components, so anything pulled in here ends up in the browser bundle.
 */

export const BRAND = {
  /** The product name, as written everywhere. */
  name: 'Hachi',

  /** The tagline. Short enough to sit under the wordmark without wrapping on a 375px screen. */
  tagline: 'Your career pal',

  /**
   * One sentence, for page metadata and link previews. Deliberately concrete — what it does and
   * what you get — rather than a description of the technology. See docs/landing-design.md on
   * why "AI-powered career platform" is the wrong register for the audience this is aimed at.
   */
  description:
    'Talk through where your career is going, and get three specific paths — each traceable to something real in your background — plus a week-by-week plan for the one you pick.',

  /** Used in the <title> of the home page. */
  titleTagline: 'Find your next move',

  /**
   * Storage namespace. Every localStorage/sessionStorage key is prefixed with this, so the
   * app's keys are identifiable and removable as a group.
   */
  storagePrefix: 'hachi:',

  /**
   * Prefix for Redis keys and custom request headers. Lowercase, no punctuation — it ends up
   * inside `hachi:rl:llm` and `x-hachi-session-id`.
   */
  slug: 'hachi',
} as const;

/**
 * Every browser storage key the app owns, namespaced under the brand slug.
 *
 * Centralised for the same reason as the name itself: the conversation key was written as a
 * bare literal in four files, so renaming it meant finding all four. Anything added here is
 * automatically namespaced, and "clear everything this app stored" is a prefix scan.
 *
 * NOTE: these keys changed during the Aria -> Hachi rename, which silently orphans any session
 * saved under the old `career_coach_*` names. That was accepted deliberately — there are no
 * real users yet — but it means a browser that used the old build will appear to have lost its
 * conversation rather than showing an error.
 */
export const STORAGE_KEYS = {
  /** The whole conversation: profile, messages, stage, deck, roadmap. localStorage. */
  session: `${BRAND.storagePrefix}session`,
  /** Random session id + sample flags, for cost attribution. localStorage. */
  sessionMeta: `${BRAND.storagePrefix}session-meta`,
  /** Resume text carried from the coach to the review surface. sessionStorage — cleared with
   * the tab, because it is a whole resume. */
  lastResumeText: `${BRAND.storagePrefix}last-resume-text`,
} as const;

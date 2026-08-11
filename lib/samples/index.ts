import { BACKEND_ENGINEER_RESUME } from './backend-engineer';
import { CAREER_SWITCHER_RESUME } from './career-switcher';
import { RECENT_GRADUATE_RESUME } from './recent-graduate';

/**
 * Three fictional sample profiles, so someone evaluating this demo can reach a full path deck
 * without uploading their own resume — which is otherwise a hard wall at step one for exactly
 * the audience most likely to be assessing it.
 *
 * All three are invented; see the header comment in each file. They are chosen to exercise
 * different routes through the coach (grow / pivot / early-career), not to look impressive.
 *
 * These feed the existing paste-text intake path — the same `/api/parse-resume` JSON entry
 * point a user typing into the textarea hits. There is deliberately no parallel intake flow
 * and no synthesised PDF: a second code path would be a second thing to keep correct, and the
 * point of the demo is the real one.
 */
export type SampleProfile = {
  /** Stable id, also recorded in session telemetry so sample traffic can be split by profile. */
  id: 'backend-engineer' | 'career-switcher' | 'recent-graduate';
  /** Shown on the picker button. */
  label: string;
  /** One line under the label — what this profile is, not what it demonstrates. */
  blurb: string;
  resumeText: string;
};

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: 'backend-engineer',
    label: 'Backend engineer, 4 years',
    blurb: 'One company since graduating, growing scope, no clear idea what comes next.',
    resumeText: BACKEND_ENGINEER_RESUME,
  },
  {
    id: 'career-switcher',
    label: 'Marketing, moving toward data',
    blurb: 'Six years in marketing, self-taught SQL, wants out of campaigns and into analysis.',
    resumeText: CAREER_SWITCHER_RESUME,
  },
  {
    id: 'recent-graduate',
    label: 'Recent graduate, no full-time role',
    blurb: 'CS degree, two internships and several projects, applying broadly and undecided.',
    resumeText: RECENT_GRADUATE_RESUME,
  },
];

export function findSampleProfile(id: string | null | undefined): SampleProfile | undefined {
  if (!id) return undefined;
  return SAMPLE_PROFILES.find((sample) => sample.id === id);
}

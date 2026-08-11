/**
 * FICTIONAL SAMPLE PROFILE — not a real person.
 *
 * Every name, company, email, phone number, and achievement below is invented for
 * demonstration purposes. Any resemblance to a real individual or organisation is
 * coincidental. Do not treat any detail here as factual.
 *
 * Exercises: the "grow" persona. Four years, one employer, steadily increasing scope but no
 * stated direction — the coach has to do real work in the UNDERSTANDING phase before the
 * recommendation gates will open, since the resume alone supplies a skill/domain but no
 * sense of what the candidate actually wants.
 */
export const BACKEND_ENGINEER_RESUME = `Priya Raghavan
Bengaluru, India | priya.raghavan@example.com | +91 90000 00000

SUMMARY
Backend engineer with 4 years at a single company, working on payments infrastructure. Started
as a graduate hire and now own two production services end to end. Comfortable with the stack
I have, less certain about what comes next.

EXPERIENCE

Software Engineer II, Payments Platform
Kestrel Financial Technologies (B2B payments infrastructure) — Bengaluru, India
July 2022 – Present (3 years)
- Own the settlement reconciliation service end to end: on-call rotation, schema changes,
  capacity planning. Handles roughly 400k transactions a day.
- Rewrote the retry pipeline for failed disbursements, cutting manual finance-team
  interventions from about 40 a week to under 5.
- Led the migration of two services from a shared monolith database to dedicated Postgres
  instances, coordinated across three teams over five months.
- Mentor the two most recent graduate hires on code review and debugging practice.
- Write the design docs for my own projects; have not yet led a design review for someone
  else's.

Software Engineer I, Payments Platform
Kestrel Financial Technologies — Bengaluru, India
June 2021 – July 2022
- Built internal REST APIs for merchant onboarding, in Python and FastAPI.
- Added integration test coverage for the disbursement flow, taking it from roughly 20% to 75%.
- Handled production support tickets on a weekly rotation.

EDUCATION
B.E. Computer Science, Karnataka Institute of Engineering — 2021

SKILLS
Python, Go (working knowledge), PostgreSQL, Redis, Kafka, Docker, Kubernetes (deploy and
debug, not cluster administration), AWS (EC2, RDS, S3, SQS), pytest, Grafana

PROJECTS
- Internal tool that visualises settlement failures by merchant and error class. Built on my
  own initiative; now used daily by the finance operations team.

CERTIFICATIONS
None.
`;

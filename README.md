# Kargo Hiring Dashboard

CV upload → redact → score (Gemini, against `rubric/kargo_hiring_rubric.txt`) → process (pure code: gates,
bands, totals) → draft (brief + invite/decline email) → dashboard → dry-run send. Arjun decides; the
system never emails a candidate on its own.

## Status / scope note

Built under a hard time budget. The core pipeline (upload through dry-run send) is implemented and has
been tested end-to-end against a real PDF, locally, including:
- redaction (name, email, phone, URL, address, DOB, gender markers, institution names)
- scoring math verified exactly against the rubric's own Section 10 calibration table
- the append-only `decisions` trigger (confirmed it blocks DELETE even via the service-role key)
- the guarded send path (decision recorded → draft generated on demand → dry-run email sent → row written
  to `emails`)

**Not done**, by explicit scope decision (ask before relying on these):
- `scripts/calibrate.ts` as a standalone script — the calibration check was run manually instead (see
  above) and the numbers match exactly.
- Automated test suite (Vitest). The math and the redaction/send guards were verified manually against
  real data instead; there is no `npm test` yet.
- Dashboard password protection — the user explicitly declined this. **The deployed URL will have no
  login.** Anyone with the link can see candidate PII and trigger sends (dry-run by default). Treat the
  Vercel URL as sensitive, or ask for this to be added back before sharing it widely.
- G3 "both" routing and the PM↔SPM near-miss flows are implemented but only unit-verified via the
  calibration numbers, not exercised with a real near-miss CV.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY`, `SCORING_MODEL` (currently `gemini-3.8-flash` — Gemini model IDs move fast; if this
     404s, smoke-test a new model string directly before changing it everywhere)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service_role / secret key — get this from the Supabase
     dashboard, Project Settings → API; it is deliberately not exposed via MCP tooling)
   - `RESEND_API_KEY`, `RESEND_FROM` (sandbox: `onboarding@resend.dev`, which can only send to the
     Resend account's own registered address)
   - `EMAIL_MODE=dry` (default) or `live`
   - `TEST_RECIPIENT` — where dry-run emails land
3. Migrations and the private `cvs` storage bucket are already applied to the Supabase project
   `kargo-hiring-dashboard` (ref in `.vercel`/dashboard). To reapply from scratch, see
   `supabase/migrations` if you export them, or re-run the SQL in this repo's history.
4. `npm run dev`, open http://localhost:3000.

## Rubric

`rubric/kargo_hiring_rubric.txt` is the system prompt for scoring. Don't edit weights or bands without
re-running the calibration check (Section 10 of the rubric) — the math in
`src/lib/processing/scoring-math.ts` is exact against those numbers today.

## Switching to live email

Set `EMAIL_MODE=live` in the deployed environment. Every send still requires a recorded decision
(enforced in code, not just the UI) and the `emails(candidate_id, type)` unique constraint still blocks
duplicate sends.

## Previously-contacted list

`public/data/previously-contacted.csv` is a header-only placeholder (`name,email,note`). Fill it in with
candidates who got an informal reply before this dashboard existed — it's pinned at the top of the
dashboard.

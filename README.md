# Job Radar — Program, Product & Quality Job Tracker

A daily-refreshed dashboard tracking demand for Program Manager, Release
Manager, PMO, Project Manager, Delivery Manager, Change Manager, Agile Coach,
Scrum Master, Release Train Engineer, Portfolio Manager, Transformation
Manager, Product Owner, Product Manager, Quality Manager and Quality Engineer
roles across Germany, Austria, Switzerland and the Netherlands — pulled from
the free [Adzuna](https://developer.adzuna.com) Jobs API.

**Live site:** hosted on Netlify (see section 4b below) — update this line
with your actual Netlify URL once you've renamed the site.

It ships with **sample data** so the site works immediately. Follow the
steps below to switch it over to live, auto-refreshing data.

## What's in here

```
index.html                  the site
assets/style.css            visual theme (light + dark mode)
assets/app.js                data loading, charts, map, comparator, search
data/*.json                  the data the site reads (starts as sample data)
scripts/fetch_jobs.py        pulls + aggregates from Adzuna into data/*.json
tests/test_fetch_jobs.py     pytest suite for the aggregation/classification logic
.github/workflows/update-data.yml   runs the script (and tests) daily, commits the result
```

## 1. Get free Adzuna API credentials

1. Sign up at <https://developer.adzuna.com/> (free).
2. Create an app to get an `app_id` and `app_key`.
3. Adzuna's free tier is generous but not unlimited — this tracker makes
   ~60 calls/day (4 countries × 15 roles), well within it, but check your
   dashboard if you add more role keywords.

## 2. Push this to a new GitHub repo

Via the command line:
```bash
cd job-market
git init
git add .
git commit -m "Initial commit: Job Radar"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
GitHub no longer accepts your account password over HTTPS — when prompted,
use a [Personal Access Token](https://github.com/settings/tokens) (classic,
`repo` scope) as the password instead.

Or, with no terminal at all: create the empty repo on github.com, then use
**"Add file → Upload files"** and drag in everything from the unzipped
folder. **Show hidden files first** (Cmd+Shift+. in Finder) so the
`.github` folder is visible and gets dragged in too — it's easy to miss and
the site won't auto-update without it.

## 3. Add your API credentials as repo secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**, add:

- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`

Double-check these go in the **Value** field, not the **Name** field, and
that both end up listed under "Repository secrets" (not "Environment
secrets").

## 4. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: "Deploy from a
branch"**, branch `main`, folder `/ (root)`, click **Save**. Your site will
be live at `https://<your-username>.github.io/<repo-name>/`.

If Pages settings look correct but the site still shows "There isn't a
GitHub Pages site here," check the **Actions** tab for a run called "pages
build and deployment" — re-saving the branch/folder dropdown forces a new
attempt if one hasn't run.

## 4b. Or deploy on Netlify instead (or as well)

Netlify is a good alternative if you want to keep the GitHub repo **private**
— GitHub Pages on the free plan requires a public repo, but Netlify can
deploy from a private repo for free and the resulting site is still public
at its own URL.

1. Sign up free at <https://app.netlify.com> and connect your GitHub account.
2. **Add new site → Import an existing project → Deploy with GitHub**, then
   pick this repo.
3. Build settings: leave **Build command** blank and set **Publish
   directory** to the repo root (this is a plain static site, no build step).
4. Click **Deploy**. Netlify gives you a `<random-name>.netlify.app` URL —
   rename it under **Site settings → Site details → Change site name** if
   you want something more readable.
5. From then on, every commit pushed to `main` (including the daily data
   sync from GitHub Actions) triggers an automatic Netlify redeploy — no
   further action needed on the Netlify side.

Netlify's connection to the repo is tied to its internal ID, not its name,
so renaming the GitHub repo later won't break the Netlify deployment.

## 5. Run the first live sync

Go to the **Actions** tab → "Update job market data" → **Run workflow**.
This runs `scripts/fetch_jobs.py`, which overwrites the sample `data/*.json`
files with live results and commits them. After that it runs automatically
every day at 06:00 UTC (08:00 CEST) via the cron schedule in
`.github/workflows/update-data.yml`.

## Troubleshooting

- **"Missing ADZUNA_APP_ID / ADZUNA_APP_KEY environment variables"** in the
  Actions log — the secret names don't match exactly (case-sensitive, no
  typos), or a value got pasted into the secret's *name* field instead of
  its *value* field. Check Settings → Secrets and variables → Actions.
- **"Get started with GitHub Actions" / template gallery instead of your
  workflow** — the `.github/workflows/update-data.yml` file didn't make it
  into the repo. Verify by browsing directly to
  `https://github.com/<user>/<repo>/blob/main/.github/workflows/update-data.yml`;
  if it 404s, add the file via **Add file → Create new file** and paste in
  the path `.github/workflows/update-data.yml` plus its contents.
- **git push asks for a password and then 403s** — you typed your real
  GitHub account password. Use a Personal Access Token instead (see step 2).

## Retargeting the tracker

To track a different role set or add more countries, edit the `ROLES` or
`COUNTRIES` dicts at the top of `scripts/fetch_jobs.py` — everything else
(aggregation, charts, map) adapts automatically to whatever roles/cities
show up in the data.

## Known limitations

See the "Limitations" tab on the live site for the full list (days-open is
a proxy, keyword-based role matching, Adzuna's coverage gaps, a short
trend-history window). Worth reading before drawing strong conclusions from
the numbers.

## How this was built

A weekend side project to learn a bit more end-to-end: a Python script
(`scripts/fetch_jobs.py`) hits the free Adzuna Jobs API and aggregates
results with the standard library, a GitHub Actions workflow runs it on a
schedule and commits the output as plain JSON, and the site itself is
vanilla HTML/CSS/JS (no framework, no build step) using Chart.js for charts
and Leaflet + OpenStreetMap for the map — all free tiers, hosted on Netlify.
Feedback and pull requests welcome; this is very much a learning project.

## Running the tests

```bash
pip install pytest requests --break-system-packages
ADZUNA_APP_ID=dummy ADZUNA_APP_KEY=dummy pytest tests/ -v
```

The tests cover the pure logic in `fetch_jobs.py` — level/job-type
classification and the aggregation math — without making real API calls.
They also run automatically as part of the daily GitHub Actions workflow,
before the live fetch, so a broken change to the aggregation logic fails
loudly instead of quietly corrupting the site's data.

## New features (this version)

- **Trend chart** — `history.json` accumulates one daily snapshot (last
  ~90 days) so the Overview page can show total postings over time, not
  just a current-state snapshot.
- **Search** — free-text search over title/company on the Postings tab.
- **"New today" filter** — flags and can filter to postings first seen in
  the last 24 hours.
- **Dark mode** — toggle in the top-right, remembered via local storage.
- **Shareable filtered links** — Postings tab filters are reflected in the
  URL, so you can copy/paste a link to a specific filtered view.
- **Sync status visibility** — if a scheduled sync fails, `sync_status.json`
  records it and the site notes that it's showing the last successful data
  rather than silently going stale with no indication.
- **Retry logic** — `fetch_page()` now retries transient failures (with
  backoff) and specifically handles HTTP 429 rate-limit responses, instead
  of giving up on the first hiccup.

# Release Radar — DACH PM / Release Management Job Tracker

A daily-refreshed dashboard tracking demand for Program Manager, Release
Manager, PMO, Delivery Manager, Change Manager, Agile Coach, Scrum Master,
Release Train Engineer, Portfolio Manager and Transformation Manager roles
across Germany, Austria and Switzerland — pulled from the free
[Adzuna](https://developer.adzuna.com) Jobs API.

**Live site:** https://sujguha.github.io/DACH-PM-job-market/

It ships with **sample data** so the site works immediately. Follow the
steps below to switch it over to live, auto-refreshing data.

## What's in here

```
index.html                  the site
assets/style.css            visual theme (light mode)
assets/app.js                data loading, charts, map, comparator
data/*.json                  the data the site reads (starts as sample data)
scripts/fetch_jobs.py        pulls + aggregates from Adzuna into data/*.json
.github/workflows/update-data.yml   runs the script daily and commits the result
```

## 1. Get free Adzuna API credentials

1. Sign up at <https://developer.adzuna.com/> (free).
2. Create an app to get an `app_id` and `app_key`.
3. Adzuna's free tier is generous but not unlimited — this tracker makes
   ~33 calls/day (3 countries × 11 roles), well within it, but check your
   dashboard if you add more role keywords.

## 2. Push this to a new GitHub repo

Via the command line:
```bash
cd dach-pm-tracker
git init
git add .
git commit -m "Initial commit: Release Radar"
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
a proxy, keyword-based role matching, Adzuna's coverage gaps, no historical
trend series yet — each sync overwrites the prior snapshot). Worth reading
before drawing strong conclusions from the numbers.

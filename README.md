# Release Radar — DACH PM / Release Management Job Tracker

A daily-refreshed dashboard tracking demand for Program Manager, Release
Manager, PMO, Delivery Manager, Change Manager, Agile Coach, Scrum Master,
Release Train Engineer, Portfolio Manager and Transformation Manager roles
across Germany, Austria and Switzerland — pulled from the free
[Adzuna](https://developer.adzuna.com) Jobs API.

It ships with **sample data** so the site works immediately. Follow the
steps below to switch it over to live, auto-refreshing data.

## What's in here

```
index.html                  the site
assets/style.css            visual theme
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

```bash
cd dach-pm-tracker
git init
git add .
git commit -m "Initial commit: Release Radar"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

## 3. Add your API credentials as repo secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**, add:

- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`

## 4. Enable GitHub Pages

**Settings → Pages → Build and deployment → Source: "Deploy from a
branch"**, branch `main`, folder `/ (root)`. Your site will be live at
`https://<your-username>.github.io/<repo-name>/`.

## 5. Run the first live sync

Go to the **Actions** tab → "Update job market data" → **Run workflow**.
This runs `scripts/fetch_jobs.py`, which overwrites the sample `data/*.json`
files with live results and commits them. After that it runs automatically
every day at 06:00 UTC (08:00 CEST) via the cron schedule in
`.github/workflows/update-data.yml`.

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

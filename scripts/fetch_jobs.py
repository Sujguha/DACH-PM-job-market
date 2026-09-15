#!/usr/bin/env python3
"""
Fetch Program/Release/PMO-style job postings across Germany, Austria and
Switzerland from the Adzuna API and aggregate them into the JSON files the
static site (in /docs or repo root, see README) reads from /data.

Requires two environment variables (set as GitHub Actions secrets, or
export locally before a manual run):
  ADZUNA_APP_ID
  ADZUNA_APP_KEY

Manual run:
  ADZUNA_APP_ID=xxx ADZUNA_APP_KEY=yyy python scripts/fetch_jobs.py
"""

import json
import os
import statistics
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

APP_ID = os.environ.get("ADZUNA_APP_ID")
APP_KEY = os.environ.get("ADZUNA_APP_KEY")

if not APP_ID or not APP_KEY:
    sys.exit("Missing ADZUNA_APP_ID / ADZUNA_APP_KEY environment variables.")

# Adzuna's country codes for the DACH region.
COUNTRIES = {"de": "Germany", "at": "Austria", "ch": "Switzerland"}

# Search keyword -> display label. Adzuna's `what` param full-text matches
# against title + description, so keep these tight to hold down noise.
# Edit this dict to retarget the tracker at a different role set.
ROLES = {
    "program manager": "Program Manager",
    "release manager": "Release Manager",
    "PMO": "PMO",
    "project manager": "Project Manager",
    "delivery manager": "Delivery Manager",
    "change manager": "Change Manager",
    "agile coach": "Agile Coach",
    "scrum master": "Scrum Master",
    "release train engineer": "Release Train Engineer",
    "portfolio manager": "Portfolio Manager",
    "transformation manager": "Transformation Manager",
}

RESULTS_PER_PAGE = 50  # Adzuna's max per page
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REQUEST_PAUSE_SECONDS = 1.0  # be polite to the free tier


def fetch_page(country_code: str, what: str):
    url = f"https://api.adzuna.com/v1/api/jobs/{country_code}/search/1"
    params = {
        "app_id": APP_ID,
        "app_key": APP_KEY,
        "results_per_page": RESULTS_PER_PAGE,
        "what": what,
        "content-type": "application/json",
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("results", [])


def days_open(created_iso: str) -> float:
    created = datetime.fromisoformat(created_iso.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    return round((now - created).total_seconds() / 86400, 1)


def main():
    postings_by_id = {}

    for country_code, country_name in COUNTRIES.items():
        for keyword, role_label in ROLES.items():
            try:
                results = fetch_page(country_code, keyword)
            except requests.RequestException as exc:
                print(f"WARN: {country_code}/{keyword} failed: {exc}", file=sys.stderr)
                continue

            for job in results:
                job_id = job.get("id")
                if not job_id or job_id in postings_by_id:
                    continue  # a job can match more than one keyword; keep first hit
                location = job.get("location", {}) or {}
                area = location.get("area", [])
                city = area[-1] if area else location.get("display_name", "Unknown")
                created = job.get("created")
                postings_by_id[job_id] = {
                    "id": job_id,
                    "title": (job.get("title") or "").strip(),
                    "company": (job.get("company") or {}).get("display_name", "Unknown"),
                    "country": country_name,
                    "country_code": country_code,
                    "city": city,
                    "lat": job.get("latitude"),
                    "lon": job.get("longitude"),
                    "created": created,
                    "days_open": days_open(created) if created else None,
                    "role": role_label,
                    "url": job.get("redirect_url"),
                    "salary_min": job.get("salary_min"),
                    "salary_max": job.get("salary_max"),
                }
            time.sleep(REQUEST_PAUSE_SECONDS)

    write_outputs(list(postings_by_id.values()))


def dict_count(items, field):
    out = defaultdict(int)
    for i in items:
        out[i[field]] += 1
    return dict(out)


def write_outputs(postings):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")

    per_country = defaultdict(int)
    for p in postings:
        per_country[p["country"]] += 1
    summary = {
        "last_updated": now_iso,
        "total_postings": len(postings),
        "by_country": dict(per_country),
        "roles_tracked": list(ROLES.values()),
    }

    role_groups = defaultdict(list)
    for p in postings:
        role_groups[p["role"]].append(p)
    by_role = []
    for role, items in sorted(role_groups.items(), key=lambda kv: -len(kv[1])):
        days = [p["days_open"] for p in items if p["days_open"] is not None]
        by_role.append({
            "role": role,
            "count": len(items),
            "avg_days_open": round(statistics.mean(days), 1) if days else None,
            "by_country": dict_count(items, "country"),
        })

    city_groups = defaultdict(list)
    for p in postings:
        city_groups[(p["city"], p["country"])].append(p)
    by_city = []
    for (city, country), items in sorted(city_groups.items(), key=lambda kv: -len(kv[1])):
        days = [p["days_open"] for p in items if p["days_open"] is not None]
        lat_vals = [p["lat"] for p in items if p["lat"] is not None]
        lon_vals = [p["lon"] for p in items if p["lon"] is not None]
        by_city.append({
            "city": city,
            "country": country,
            "count": len(items),
            "avg_days_open": round(statistics.mean(days), 1) if days else None,
            "lat": round(statistics.mean(lat_vals), 4) if lat_vals else None,
            "lon": round(statistics.mean(lon_vals), 4) if lon_vals else None,
        })

    cr_groups = defaultdict(list)
    for p in postings:
        cr_groups[(p["city"], p["country"], p["role"])].append(p)
    city_role = []
    for (city, country, role), items in cr_groups.items():
        days = [p["days_open"] for p in items if p["days_open"] is not None]
        city_role.append({
            "city": city,
            "country": country,
            "role": role,
            "count": len(items),
            "avg_days_open": round(statistics.mean(days), 1) if days else None,
        })

    company_groups = defaultdict(list)
    for p in postings:
        company_groups[p["company"]].append(p)
    by_company = sorted(
        ({"company": c, "count": len(items)} for c, items in company_groups.items()),
        key=lambda x: -x["count"],
    )[:25]

    postings_sorted = sorted(postings, key=lambda p: p["created"] or "", reverse=True)[:300]

    _write("summary.json", summary)
    _write("by_role.json", by_role)
    _write("by_city.json", by_city)
    _write("city_role.json", city_role)
    _write("by_company.json", by_company)
    _write("postings.json", postings_sorted)


def _write(filename, data):
    path = DATA_DIR / filename
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    count = len(data) if isinstance(data, list) else 1
    print(f"wrote {path} ({count} records)")


if __name__ == "__main__":
    main()

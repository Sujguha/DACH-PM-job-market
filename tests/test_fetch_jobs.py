"""
Tests for the pure logic in scripts/fetch_jobs.py — title/level/job-type
classification and the aggregation math. Doesn't hit the network.

Run with:
  pip install pytest --break-system-packages
  ADZUNA_APP_ID=x ADZUNA_APP_KEY=x pytest tests/
(dummy credentials are fine — the module only checks they're non-empty
at import time; no request is actually made in these tests)
"""
import os
import sys
from pathlib import Path

# Dummy creds so importing the module doesn't sys.exit().
os.environ.setdefault("ADZUNA_APP_ID", "test")
os.environ.setdefault("ADZUNA_APP_KEY", "test")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fetch_jobs  # noqa: E402


def test_guess_level_senior():
    assert fetch_jobs.guess_level("Senior Release Manager (m/w/d)") == "Senior"
    assert fetch_jobs.guess_level("Lead Program Manager") == "Senior"
    assert fetch_jobs.guess_level("Head of PMO") == "Senior"


def test_guess_level_junior():
    assert fetch_jobs.guess_level("Junior Project Manager") == "Junior"
    assert fetch_jobs.guess_level("Werkstudent Quality Engineer") == "Junior"


def test_guess_level_mid_default():
    assert fetch_jobs.guess_level("Release Manager") == "Mid"
    assert fetch_jobs.guess_level("") == "Mid"
    assert fetch_jobs.guess_level(None) == "Mid"


def test_guess_job_type_contract_overrides_time():
    job = {"contract_type": "contract", "contract_time": "full_time"}
    assert fetch_jobs.guess_job_type(job) == "Contract"


def test_guess_job_type_part_time():
    job = {"contract_type": "permanent", "contract_time": "part_time"}
    assert fetch_jobs.guess_job_type(job) == "Part time"


def test_guess_job_type_full_time():
    job = {"contract_type": "permanent", "contract_time": "full_time"}
    assert fetch_jobs.guess_job_type(job) == "Full time"


def test_guess_job_type_unspecified():
    assert fetch_jobs.guess_job_type({}) == "Not specified"


def test_days_open_computes_positive_float():
    from datetime import datetime, timezone, timedelta
    ten_days_ago = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat().replace("+00:00", "Z")
    result = fetch_jobs.days_open(ten_days_ago)
    assert 9.9 <= result <= 10.1


def test_dict_count_tallies_by_field():
    items = [{"country": "Germany"}, {"country": "Germany"}, {"country": "Austria"}]
    assert fetch_jobs.dict_count(items, "country") == {"Germany": 2, "Austria": 1}


def _sample_postings():
    return [
        {
            "id": "1", "title": "Senior Release Manager", "company": "Siemens",
            "country": "Germany", "country_code": "de", "city": "Munich",
            "lat": 48.1, "lon": 11.5, "created": "2026-09-01T00:00:00Z",
            "days_open": 5.0, "role": "Release Manager", "level": "Senior",
            "job_type": "Full time", "url": "https://example.com/1",
            "salary_min": None, "salary_max": None,
        },
        {
            "id": "2", "title": "Release Manager", "company": "Siemens",
            "country": "Germany", "country_code": "de", "city": "Munich",
            "lat": 48.1, "lon": 11.5, "created": "2026-09-02T00:00:00Z",
            "days_open": 15.0, "role": "Release Manager", "level": "Mid",
            "job_type": "Contract", "url": "https://example.com/2",
            "salary_min": None, "salary_max": None,
        },
        {
            "id": "3", "title": "PMO Analyst", "company": "SAP",
            "country": "Austria", "country_code": "at", "city": "Vienna",
            "lat": 48.2, "lon": 16.4, "created": "2026-09-03T00:00:00Z",
            "days_open": 2.0, "role": "PMO", "level": "Mid",
            "job_type": "Full time", "url": "https://example.com/3",
            "salary_min": None, "salary_max": None,
        },
    ]


def test_write_outputs_produces_correct_aggregates(tmp_path, monkeypatch):
    monkeypatch.setattr(fetch_jobs, "DATA_DIR", tmp_path)
    fetch_jobs.write_outputs(_sample_postings(), failed_queries=0, total_queries=60)

    import json
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["total_postings"] == 3
    assert summary["by_country"] == {"Germany": 2, "Austria": 1}
    assert summary["failed_queries"] == 0

    by_role = json.loads((tmp_path / "by_role.json").read_text())
    release_mgr = next(r for r in by_role if r["role"] == "Release Manager")
    assert release_mgr["count"] == 2
    assert release_mgr["avg_days_open"] == 10.0  # mean of 5.0 and 15.0

    history = json.loads((tmp_path / "history.json").read_text())
    assert len(history) == 1
    assert history[0]["total_postings"] == 3


def test_history_appends_and_replaces_same_day(tmp_path, monkeypatch):
    monkeypatch.setattr(fetch_jobs, "DATA_DIR", tmp_path)
    fetch_jobs._append_history("2026-09-01T06:00:00Z", 100, {"Germany": 100})
    fetch_jobs._append_history("2026-09-01T18:00:00Z", 120, {"Germany": 120})
    fetch_jobs._append_history("2026-09-02T06:00:00Z", 130, {"Germany": 130})

    import json
    history = json.loads((tmp_path / "history.json").read_text())
    # Same-day re-run should replace, not duplicate.
    assert len(history) == 2
    assert history[0]["date"] == "2026-09-01"
    assert history[0]["total_postings"] == 120
    assert history[1]["date"] == "2026-09-02"


def test_history_trims_to_max_entries(tmp_path, monkeypatch):
    monkeypatch.setattr(fetch_jobs, "DATA_DIR", tmp_path)
    monkeypatch.setattr(fetch_jobs, "HISTORY_MAX_ENTRIES", 3)
    for day in range(1, 6):
        fetch_jobs._append_history(f"2026-09-0{day}T06:00:00Z", day * 10, {})

    import json
    history = json.loads((tmp_path / "history.json").read_text())
    assert len(history) == 3
    assert [h["date"] for h in history] == ["2026-09-03", "2026-09-04", "2026-09-05"]

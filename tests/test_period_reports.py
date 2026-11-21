"""Period selection must change evidence and preserve independently validated reports."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from trend_tracker.monthly_report import (
    REPORT_VERSION, attach_reports, build_evidence_pack, build_monthly_prompt,
    evidence_fingerprint, validate_monthly_report,
)
from trend_tracker.trend_summary import build_trend_summary


def fixture():
    reference = datetime(2026, 11, 21, tzinfo=timezone.utc)
    articles = [{
        "company": f"Company {age}", "title": f"Article {age}",
        "url": f"https://example.com/{age}",
        "published_at": (reference - timedelta(days=age)).isoformat(),
        "relevance": "high", "tech_domains": ["DRAM·HBM"],
        "job_roles": ["공정기술·양산기술"], "signal_types": ["기술·제품"],
    } for age in (1, 6, 7, 10, 35, 89, 91, -1)]
    return {
        "articles": articles,
        "trend_summary": build_trend_summary(articles, reference.isoformat()),
    }


def report_for(pack):
    metric = pack["metrics"][0]["id"]
    article = pack["articles"][0]
    return {
        "report_version": REPORT_VERSION,
        "window_days": pack["window_days"],
        "headline_ko": pack["period"], "summary_ko": "기간에 맞는 분석",
        "key_findings": [
            {"title_ko": "동향", "interpretation_ko": "관찰", "evidence_metric_ids": [metric],
             "related_roles": ["공정기술·양산기술"]},
            {"title_ko": "동향2", "interpretation_ko": "관찰2", "evidence_metric_ids": [metric],
             "related_roles": ["공정기술·양산기술"]},
        ],
        "company_insights": [{
            "company": article["company"], "observation_ko": "발표 관찰",
            "evidence_article_ids": [article["id"]],
        }],
        "role_actions": [{
            "role": "공정기술·양산기술", "watch_points_ko": ["원문 확인"],
            "study_points_ko": ["기술 원리"], "evidence_metric_ids": [metric],
        }],
        "limitations_ko": ["공식 발표 빈도이며 시장 중요도와 다릅니다."],
    }


def entry(pack):
    return {
        "validation_status": "PASS", "source_fingerprint": evidence_fingerprint(pack),
        "report": report_for(pack), "evidence": pack, "model": "test",
        "generated_at": "2026-11-21T01:00:00+00:00",
    }


class PeriodReportTests(unittest.TestCase):
    def test_periods_filter_evidence_and_metrics(self):
        payload = fixture()
        for days, expected in ((7, 3), (30, 4), (90, 6)):
            pack = build_evidence_pack(payload, days)
            self.assertEqual(pack["high_relevance_count"], expected)
            self.assertEqual(len(pack["articles"]), expected)
            self.assertEqual(len(payload["trend_summary"]["windows"][str(days)]["company_profiles"]),
                             expected)
            self.assertTrue(all(f"최근 {days}일" in metric["text_ko"]
                                for metric in pack["metrics"] if "previous_count" not in metric))
            self.assertIn(f'"window_days": {days}', build_monthly_prompt(pack))
            self.assertNotIn("https://example.com/-1", {a["url"] for a in pack["articles"]})
            if days != 30:
                self.assertFalse(any("previous_count" in m for m in pack["metrics"]))
        with self.assertRaises(ValueError):
            build_evidence_pack(payload, 14)

    def test_only_current_period_reports_are_attached(self):
        payload = fixture()
        cache = {"reports": {str(days): entry(build_evidence_pack(payload, days))
                             for days in (7, 30, 90)}}
        attach_reports(payload, cache)
        self.assertEqual(set(payload["trend_reports"]), {"7", "30", "90"})
        self.assertEqual(payload["monthly_trend_report"]["window_days"], 30)
        cache["reports"]["7"]["source_fingerprint"] = "stale"
        cache["reports"]["90"]["report"]["window_days"] = 30
        attach_reports(payload, cache)
        self.assertEqual(set(payload["trend_reports"]), {"30"})
        payload["trend_summary"]["reference_at"] = "2026-11-22T00:00:00+00:00"
        attach_reports(payload, cache)
        self.assertEqual(payload["trend_reports"], {})
        self.assertNotIn("monthly_trend_report", payload)

    def test_wrong_company_or_malformed_evidence_is_rejected(self):
        pack = build_evidence_pack(fixture(), 7)
        report = report_for(pack)
        self.assertEqual(validate_monthly_report(report, pack), [])
        report["company_insights"][0]["company"] = pack["articles"][1]["company"]
        self.assertTrue(validate_monthly_report(report, pack))
        report["key_findings"] = [None, {"evidence_metric_ids": [{}]}]
        self.assertTrue(validate_monthly_report(report, pack))
        self.assertTrue(validate_monthly_report(None, pack))

    def test_generation_failure_is_isolated_and_retried_from_cache(self):
        spec = importlib.util.spec_from_file_location(
            "period_generation", ROOT / "scripts" / "analyze_monthly_trend.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            web = folder / "latest.json"
            web.write_text(json.dumps(fixture()), encoding="utf-8")
            calls = []

            def generate(prompt, key, model):
                pack = json.loads(prompt.split("[근거 데이터]")[1])
                days = pack["window_days"]
                calls.append(days)
                if days == 30 and calls.count(30) == 1:
                    raise RuntimeError("simulated failure")
                return report_for(pack), "test"

            with patch.multiple(module, WEB_DATA_PATH=web, CACHE_PATH=folder / "cache.json",
                                REPORT_PATH=folder / "validation.md", call_gemini=generate):
                with patch.dict(os.environ, {"GEMINI_API_KEY": "test-placeholder"}):
                    with self.assertRaises(SystemExit):
                        module.main()
                    first = json.loads(web.read_text(encoding="utf-8"))
                    self.assertEqual(set(first["trend_reports"]), {"7", "90"})
                    module.main()
            self.assertEqual(calls, [7, 30, 90, 30])
            result = json.loads(web.read_text(encoding="utf-8"))
            self.assertEqual(set(result["trend_reports"]), {"7", "30", "90"})
            self.assertEqual(result["monthly_trend_report"]["window_days"], 30)


if __name__ == "__main__":
    unittest.main()

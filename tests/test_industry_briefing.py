"""Reject fabricated quotations, stale background and unverified replacement reports."""

import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "scripts")]
from trend_tracker.industry_briefing import (
    AREAS, VERSION, discover_candidates, fingerprint, prepare_sources,
    public_document, safe_url, source_from_html, validate_report,
    validate_review,
)

NOW = datetime(2026, 11, 21, tzinfo=timezone.utc)


def fixture():
    quote = "Demand for advanced chips remained strong across multiple markets."
    sources = [{
        "id": f"S{i}", "publisher": f"Publisher {i}",
        "kind": ("기업 발표", "산업 통계", "연구보고서")[i % 3],
        "title": "Quarterly industry update", "url": f"https://news.samsung.com/source-{i}",
        "published_at": "2026-11-01", "scope": "article_body", "body": quote,
    } for i in range(1, 7)]
    facts = [{"id": f"F{i}", "source_id": f"S{i}", "statement_ko": "첨단 반도체 수요가 견조했다고 발표했다.",
              "quote": quote, "nature": "발표"} for i in range(1, 7)]
    report = {
        "version": VERSION, "facts": facts,
        "overview": [{"area": area, "text_ko": "발표 자료에서 관찰한 변화", "fact_ids": [f"F{i}"]}
                     for i, area in enumerate(AREAS, 1)],
        "issues": [{"id": f"issue-{i}", "title_ko": "산업 쟁점", "why_ko": "관찰한 변화의 의미",
                    "perspectives": ["한 관점", "다른 관점"], "questions": ["무엇을 확인할까?", "어떻게 판단할까?"],
                    "samsung_connection_ko": "산업 내 검토할 접점", "fact_ids": [f"F{i*2-1}", f"F{i*2}"]}
                   for i in range(1, 4)],
    }
    return sources, report


class IndustryBriefingTests(unittest.TestCase):
    def test_real_quotes_and_cross_source_references(self):
        sources, report = fixture()
        self.assertEqual(validate_report(report, sources), [])
        report["facts"][0]["quote"] = "This invented sentence never appeared in the source document."
        self.assertTrue(any("인용 불일치" in issue for issue in validate_report(report, sources)))

    def test_invented_numbers_and_forecast_as_result_are_rejected(self):
        sources, report = fixture()
        report["facts"][0]["statement_ko"] = "매출이 999% 증가했다."
        self.assertTrue(any("없는 수치" in issue for issue in validate_report(report, sources)))
        sources[0]["body"] = "Demand is expected to remain strong in the coming quarter."
        report["facts"][0].update(statement_ko="수요가 견조하게 유지됐다.", quote=sources[0]["body"])
        self.assertTrue(any("전망을 실적으로" in issue for issue in validate_report(report, sources)))

    def test_keyword_quote_and_incomplete_semantic_review_are_rejected(self):
        sources, report = fixture()
        sources[0]["body"] = "AI-driven scaling roadmap"
        report["facts"][0]["quote"] = sources[0]["body"]
        self.assertTrue(any("인용 불일치" in i for i in validate_report(report, sources)))
        self.assertTrue(validate_review({"verdict": "PASS", "unsupported": []}, report))
        review = {"verdict": "FAIL", "unsupported": [{"path": "facts.F1", "reason_ko": "별개 행위를 추가함"}],
                  "reviewed_fact_ids": [f"F{i}" for i in range(1, 7)],
                  "reviewed_overview_count": 4, "reviewed_issue_count": 3}
        self.assertTrue(any("별개 행위" in i for i in validate_review(review, report)))

    def test_unknown_or_single_source_interpretations_are_rejected(self):
        sources, report = fixture()
        report["issues"][0]["fact_ids"] = ["F99"]
        self.assertTrue(validate_report(report, sources))
        report["issues"][0]["fact_ids"] = ["F1", "F1"]
        self.assertTrue(any("서로 다른 출처" in i for i in validate_report(report, sources)))

    def test_old_future_and_expired_reviewed_sources_are_excluded(self):
        sources, _ = fixture()
        sources[0]["published_at"] = "2025-01-01"
        sources[1]["published_at"] = "2027-01-01"
        sources[2].update(scope="reviewed_excerpt", reviewed_at="2026-01-01")
        sources[3]["url"] = "http://localhost/private"
        self.assertEqual(len(prepare_sources(sources, NOW)), 2)
        self.assertFalse(safe_url("https://www.iea.org:8443/private"))
        self.assertFalse(safe_url("https://name:password@www.iea.org/report"))

    def test_old_feed_does_not_reintroduce_old_earnings(self):
        old_feed = """<rss><channel><item><title>Samsung Electronics Announces First Quarter 2025 Results</title>
        <link>https://news.samsung.com/old</link><pubDate>Wed, 30 Apr 2025 09:15:53 +0000</pubDate></item></channel></rss>"""
        def fetch(url):
            return old_feed if url.endswith("feed") else '<a href="https://www.semiconductors.org/global-semiconductor-sales-current/">Sales</a>'
        rows, _ = discover_candidates({"articles": []}, NOW, fetch)
        samsung = next(r for r in rows if r["publisher"] == "Samsung Electronics")
        self.assertIn("third-quarter-2026", samsung["url"])
        self.assertNotIn("published_at", samsung)

    def test_missing_publication_date_is_not_replaced_with_today(self):
        html = "<p>" + "Official semiconductor article with relevant facts. " * 10 + "</p>"
        with self.assertRaises(ValueError):
            source_from_html({"title": "Report", "url": "https://www.iea.org/report"}, html, NOW)

    def test_public_data_contains_no_full_bodies(self):
        sources, report = fixture()
        output = public_document(report, sources, NOW.isoformat(), NOW.isoformat(), [])
        self.assertTrue(all("body" not in s for s in output["sources"]))
        self.assertEqual(output["refresh_status"], "complete")

    def test_failed_generation_preserves_last_verified_report_and_date(self):
        spec = importlib.util.spec_from_file_location("briefing_builder", ROOT / "scripts/build_industry_briefing.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sources, report = fixture()
        old = public_document(report, sources, "2026-11-15T00:00:00Z", "2026-11-15T00:00:00Z", [])
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            input_file, output = folder / "latest.json", folder / "brief.json"
            input_file.write_text('{"articles":[]}', encoding="utf-8")
            output.write_text(json.dumps(old), encoding="utf-8")
            with patch.multiple(module, INPUT=input_file, OUTPUT=output, RUNTIME=folder / "sources.json",
                                NOTES=folder / "notes.json", collect=lambda *args: (sources, []),
                                call_gemini=lambda *args: (_ for _ in ()).throw(RuntimeError("test failure"))):
                with patch.dict(os.environ, {"GEMINI_API_KEY": "test-placeholder"}):
                    with self.assertRaises(SystemExit):
                        module.main()
            preserved = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(preserved["facts"], old["facts"])
            self.assertEqual(preserved["generated_at"], old["generated_at"])
            self.assertEqual(preserved["checked_at"], old["checked_at"])
            self.assertEqual(preserved["refresh_status"], "failed")


if __name__ == "__main__":
    unittest.main()

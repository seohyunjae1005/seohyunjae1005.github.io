"""사이트 변경·통신 장애·부분 실패가 최신 뉴스 갱신을 숨기지 않는지 검사한다."""

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from trend_tracker import applied_materials, intel, kla, micron, news_http
from trend_tracker.news_identity import same_story
from trend_tracker.rss import Article


def sample(company="KLA", age=1, title="Official release", url="https://ir.kla.com/news/test"):
    now = datetime.now(timezone.utc)
    return Article(company.lower(), company, title, url, (now - timedelta(days=age)).isoformat(), "Official release", now.isoformat())


class NewsResilienceTests(unittest.TestCase):
    def test_incomplete_success_page_is_rechecked_once(self):
        with patch.object(news_http, "CHANNELS", []), patch.object(news_http.time, "sleep"):
            collect = Mock(side_effect=[ValueError("truncated page"), [sample()]])
            self.assertEqual(len(news_http.checked_channel("news", collect)), 1)
            self.assertEqual(news_http.CHANNELS[0]["attempts"], 2)
            self.assertEqual(news_http.CHANNELS[0]["status"], "ok")

    def test_transient_failure_is_retried_but_access_denial_is_not(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b"valid official data"
        with patch.object(news_http, "compatible_http", None), patch.object(news_http, "REQUESTS", []):
            with patch.object(news_http, "urlopen", side_effect=[HTTPError("https://example.com", 503, "unavailable", {}, None), Response()]) as fetch:
                with patch.object(news_http.time, "sleep"):
                    self.assertEqual(news_http.fetch_bytes("https://example.com"), b"valid official data")
                self.assertEqual(fetch.call_count, 2)
            with patch.object(news_http, "urlopen", side_effect=HTTPError("https://example.com", 403, "denied", {}, None)) as fetch:
                with self.assertRaises(HTTPError): news_http.fetch_bytes("https://example.com")
                self.assertEqual(fetch.call_count, 1)

    def test_network_retries_are_bounded_and_retry_after_is_respected(self):
        with patch.object(news_http, "compatible_http", None):
            with patch.object(news_http, "urlopen", side_effect=URLError("temporary")) as fetch, patch.object(news_http.time, "sleep"):
                with self.assertRaises(URLError): news_http.fetch_bytes("https://example.com")
                self.assertEqual(fetch.call_count, 3)
            with patch.object(news_http, "urlopen", side_effect=HTTPError("https://example.com", 429, "limited", {"Retry-After": "120"}, None)) as fetch:
                with self.assertRaises(HTTPError): news_http.fetch_bytes("https://example.com")
                self.assertEqual(fetch.call_count, 1)

    def test_micron_search_sends_referring_page_and_rejects_changed_schema(self):
        day = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        payload = {"searchResults": {"docs": [{"modifieddate": day, "title_en": "Memory update", "pageurl": "https://www.micron.com/about/blog/test"}]}}
        with patch.object(micron, "fetch_bytes", return_value=json.dumps(payload).encode()) as fetch:
            self.assertEqual(len(micron.fetch_micron_technology()), 1)
            self.assertEqual(fetch.call_args.kwargs["headers"]["Referer"], "https://www.micron.com/about/blog")
        with patch.object(micron, "fetch_bytes", return_value=b'{"different_schema":true}'):
            with self.assertRaises(ValueError): micron.fetch_micron_technology()

    def test_official_archive_parsers_preserve_source_dates(self):
        day = datetime.now(timezone.utc) - timedelta(days=2)
        date = day.strftime("%B %d, %Y")
        html = f'''<div class="cmp-teaser"><h2 class="cmp-teaser__title">Memory release</h2>
            <div class="cmp-teaser__description"><p>{date}</p></div>
            <a class="cmp-teaser__action-link" href="https://investors.micron.com/news/test">Read</a></div>'''
        self.assertEqual(micron.parse_press_news(html)[0].published_at[:10], day.date().isoformat())
        html = f'<table><tr><td>{day.strftime("%b %d, %Y")}</td><td><a href="/us/en/newsroom/test">New etch system</a></td></tr></table>'
        rows = applied_materials.parse_corporate_archive(html, day - timedelta(days=180))
        self.assertEqual(rows[0].published_at[:10], day.date().isoformat())
        self.assertEqual(intel._parse_date("November 23, 2026"), intel._parse_date("November 23,2026"))

    def test_kla_broken_blog_does_not_discard_current_press_release(self):
        item = sample()
        feed = f'<rss><channel><item><title>{item.title}</title><link>{item.url}</link><pubDate>{datetime.fromisoformat(item.published_at).strftime("%a, %d %b %Y %H:%M:%S +0000")}</pubDate></item></channel></rss>'.encode()
        def request(url): return feed if url == kla.IR_RSS_URL else b'<html>changed blog</html>'
        with patch.object(kla, "_request", side_effect=request), patch.object(news_http, "CHANNELS", []):
            rows = kla.fetch_kla_news()
            self.assertEqual(len(rows), 1)
            self.assertEqual([row["status"] for row in news_http.CHANNELS], ["ok", "failed"])

    def test_cross_site_copies_merge_but_weekly_announcements_survive(self):
        left = sample("Intel", 1, "Quarterly results", "https://www.intc.com/news/a").to_dict()
        copy = {**left, "url": "https://www.intel.com/news/a", "published_at": (datetime.fromisoformat(left["published_at"]) - timedelta(hours=30)).isoformat()}
        self.assertTrue(same_story(left, copy))
        weekly = {**left, "url": "https://www.intc.com/news/b", "published_at": (datetime.fromisoformat(left["published_at"]) - timedelta(days=7)).isoformat()}
        self.assertFalse(same_story(left, weekly))

    def test_old_output_is_not_accepted_as_a_fresh_collector_result(self):
        spec = importlib.util.spec_from_file_location("collection_resilience", ROOT / "scripts/run_daily_collection.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder, patch.object(module.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")):
            with patch.object(module, "PROJECT_ROOT", Path(folder)):
                result = module.run_collector(Path(folder) / "no_output.py", "KLA", datetime.now(timezone.utc))
        self.assertEqual(result["rows"], [])
        self.assertTrue(any(check["status"] == "failed" for check in result["checks"]))

    def test_partial_fetch_preserves_new_rows_and_last_full_success(self):
        spec = importlib.util.spec_from_file_location("partial_collection", ROOT / "scripts/run_daily_collection.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        item = sample().to_dict()
        result = {"returncode": 0, "rows": [item], "checks": [{"name": "news", "status": "ok"}, {"name": "blog", "status": "failed"}], "retry_count": 1}
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            published, raw, out = [folder / name for name in ("published.json", "raw.json", "out.json")]
            published.write_text(json.dumps({"articles": [], "collection_sources": [{"company": "KLA", "last_success_at": "2026-11-01T00:00:00Z", "consecutive_failures": 2}]}))
            with patch.multiple(module, PUBLISHED_PATH=published, INPUT_PATHS=(raw,), OUTPUT_PATH=out,
                    COLLECTORS=(folder / "fetch_kla_news.py",), COMPANIES=("KLA",), source_urls=lambda: {}, run_collector=lambda *args: result):
                module.main()
            output = json.loads(out.read_text(encoding="utf-8"))
        source = output["collection_sources"][0]
        self.assertEqual(source["status"], "partial")
        self.assertEqual(source["last_success_at"], "2026-11-01T00:00:00Z")
        self.assertEqual(source["consecutive_failures"], 3)
        self.assertEqual(len(output["articles"]), 1)


if __name__ == "__main__": unittest.main()

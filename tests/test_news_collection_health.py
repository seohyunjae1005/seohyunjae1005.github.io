"""공식 사이트 이전·빈 응답·수집 실패가 뉴스 누락을 숨기지 않는지 검사한다."""

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from trend_tracker import asml, lam_research, samsung_archive


class OfficialNewsTests(unittest.TestCase):
    def test_lam_new_api_and_technical_blog_preserve_dates(self):
        today = datetime.now(timezone.utc).date().isoformat()
        api = {"success": True, "totalPages": 1, "releases": [{
            "date": today, "title": "New atomic layer etch process",
            "releaseId": "release with spaces", "summary": "A technical update."
        }]}
        blog = f'''<div class="additional-resources__card allBlogs" data-header="3D chip etch"
            data-created-date="{today}"><a class="additional-resources__card-title"
            href="/test/?blog=true">3D chip etch</a></div>'''
        def request(url):
            return blog if url == lam_research.BLOG_URL else json.dumps(api)
        with patch.object(lam_research, "_request", side_effect=request):
            rows = lam_research.fetch_lam_research_news()
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row[0].published_at.startswith(today) for row in rows))
        self.assertTrue(any("release%20with%20spaces" in row[0].url for row in rows))
        with self.assertRaises(ValueError):
            lam_research._api_rows({"success": False, "releases": []})

    def test_lam_empty_response_is_not_a_success(self):
        with patch.object(lam_research, "_request", return_value='{"success":true,"releases":[]}'):
            with self.assertRaisesRegex(ValueError, "0건"):
                lam_research.fetch_lam_research_news()

    def test_samsung_newsroom_reads_second_rss_page(self):
        recent = datetime.now(timezone.utc) - timedelta(days=2)
        old = recent - timedelta(days=200)
        def feed(title, date):
            return f'<rss><channel><item><title>{title}</title><link>https://news.samsungsemiconductor.com/global/{title}</link><pubDate>{date.strftime("%a, %d %b %Y %H:%M:%S +0000")}</pubDate></item></channel></rss>'.encode()
        class Response:
            def __init__(self, data): self.data = data
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return self.data
        replies = [Response(feed("first", recent)), Response(feed("second", recent)), Response(feed("old", old))]
        with patch.object(samsung_archive, "urlopen", side_effect=replies) as fetch:
            rows = samsung_archive.fetch_semiconductor_newsroom()
        self.assertEqual([row.title for row in rows], ["first", "second"])
        self.assertIn("paged=2", fetch.call_args_list[1].args[0].full_url)

    def test_asml_blocked_investor_feed_is_not_story_only_success(self):
        with patch.object(asml, "_request", side_effect=OSError("403")):
            with self.assertRaises(OSError):
                asml.fetch_asml_news()

    def test_zero_rows_keep_published_cache_and_last_success(self):
        spec = importlib.util.spec_from_file_location("collection", ROOT / "scripts/run_daily_collection.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        now = datetime.now(timezone.utc)
        def article(title, age):
            return {"company": "Lam Research", "title": title, "url": "https://newsroom.lamresearch.com/" + title,
                    "published_at": (now - timedelta(days=age)).isoformat()}
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            published, source, output = [folder / name for name in ("published.json", "source.json", "out.json")]
            source.write_text("[]")
            published.write_text(json.dumps({"articles": [article("valid", 1), article("expired", 181), article("future", -1)],
                "collection_sources": [{"company": "Lam Research", "last_success_at": "2026-10-01T00:00:00Z"}]}))
            with patch.multiple(module, PUBLISHED_PATH=published, INPUT_PATHS=(source,), OUTPUT_PATH=output,
                    COLLECTORS=(folder / "fetch_lam_research_news.py",), COMPANIES=("Lam Research",), source_urls=lambda: {}):
                with patch.object(module.subprocess, "run", return_value=SimpleNamespace(returncode=0)):
                    module.main()
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual([row["title"] for row in payload["articles"]], ["valid"])
        self.assertEqual(payload["collection_status"]["fetch_lam_research_news"], "cached_after_error")
        self.assertEqual(payload["collection_sources"][0]["last_success_at"], "2026-10-01T00:00:00Z")


if __name__ == "__main__":
    unittest.main()

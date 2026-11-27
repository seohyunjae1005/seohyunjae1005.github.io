"""Micron 공식 기술 블로그의 최근 6개월 게시물을 수집한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.micron import fetch_micron_news
from trend_tracker.rss import semiconductor_keyword_matches


OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "micron_semiconductor.json"))


def main() -> None:
    articles = fetch_micron_news(days=180)
    rows = []
    for article in articles:
        matches = semiconductor_keyword_matches(article)
        rows.append(
            {
                **article.to_dict(),
                "selection_method": "official_newsroom_and_technology_blog_v2",
                "source_category": "Technology blog" if "/about/blog/" in article.url else "Press release",
                "relevance": "high" if matches else "context",
                "matched_keywords": matches or ["Micron Technology blog"],
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Micron 최근 180일 기술 게시물: {len(rows)}건")
    print(f"저장 위치: {OUTPUT_PATH}")
    for row in rows[:5]:
        print(f"- {row['published_at']} | {row['title']} [근거: {', '.join(row['matched_keywords'])}]")


if __name__ == "__main__":
    main()

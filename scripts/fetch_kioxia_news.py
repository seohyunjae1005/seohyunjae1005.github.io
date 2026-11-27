"""Kioxia 공식 뉴스에서 최근 6개월 반도체 관련 기사를 수집한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.kioxia import fetch_kioxia_news
from trend_tracker.rss import filter_semiconductor_articles


OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "raw" / "kioxia.json"))
FILTERED_OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "kioxia_semiconductor.json"


def main() -> None:
    articles = fetch_kioxia_news(days=180)
    selected = filter_semiconductor_articles(articles)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps([article.to_dict() for article in articles], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    FILTERED_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    FILTERED_OUTPUT_PATH.write_text(
        json.dumps(
            [
                {
                    **article.to_dict(),
                    "selection_method": "keyword_v1",
                    "matched_keywords": matches,
                }
                for article, matches in selected
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"최근 180일 전체 뉴스: {len(articles)}건")
    print(f"반도체 기술 후보: {len(selected)}건")
    print(f"후보 저장: {FILTERED_OUTPUT_PATH}")
    for article, matches in selected[:5]:
        print(f"- {article.published_at} | {article.title} [근거: {', '.join(matches)}]")


if __name__ == "__main__":
    main()

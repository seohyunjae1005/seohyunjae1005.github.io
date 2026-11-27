"""SK hynix 최근 RSS와 6개월 TECH&AI 목록을 통합한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.rss import (
    fetch_rss,
    filter_semiconductor_articles,
    semiconductor_keyword_matches,
    unique_by_url,
)
from trend_tracker.skhynix_archive import fetch_tech_archive
from trend_tracker.news_http import checked_channel


RSS_URL = "https://news.skhynix.com/en/feed"
OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "sk_hynix_semiconductor.json"))


def main() -> None:
    archive = checked_channel("기술 뉴스 목록", lambda: fetch_tech_archive(days=180))
    rss = checked_channel("공식 최신 뉴스 피드", lambda: unique_by_url(fetch_rss(RSS_URL, source_id="sk_hynix", company="SK hynix")))
    rss_selected = filter_semiconductor_articles(rss)

    rows: list[dict] = []
    seen_titles: set[str] = set()
    for article in archive:
        title_key = " ".join(article.title.casefold().split())
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        rows.append(
            {
                **article.to_dict(),
                "selection_method": "official_tech_ai_category",
                "matched_keywords": semiconductor_keyword_matches(article) or ["SK hynix TECH&AI"],
            }
        )
    for article, matches in rss_selected:
        title_key = " ".join(article.title.casefold().split())
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        rows.append(
            {
                **article.to_dict(),
                "selection_method": "rss_keyword_v1",
                "matched_keywords": matches,
            }
        )
    rows.sort(key=lambda row: row.get("published_at") or "", reverse=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"SK hynix TECH&AI 180일: {len(archive)}건")
    print(f"RSS 추가 후보: {len(rss_selected)}건")
    print(f"중복 제거 통합: {len(rows)}건")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

"""Samsung 공식 반도체 카테고리의 최근 6개월 기사를 수집한다."""

from __future__ import annotations

import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.rss import semiconductor_keyword_matches
from trend_tracker.samsung_archive import fetch_samsung_semiconductors


OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "samsung_semiconductor.json"


def main() -> None:
    articles = fetch_samsung_semiconductors(days=180)
    rows = [
        {
            **article.to_dict(),
            "selection_method": "official_semiconductor_newsroom_plus_category",
            "matched_keywords": semiconductor_keyword_matches(article) or ["Samsung Semiconductors"],
        }
        for article in articles
    ]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Samsung 최근 180일 반도체 기사: {len(rows)}건")
    print(f"저장 위치: {OUTPUT_PATH}")
    for row in rows[:5]:
        print(f"- {row['published_at']} | {row['title']}")


if __name__ == "__main__":
    main()

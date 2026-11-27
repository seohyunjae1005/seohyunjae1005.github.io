"""Intel 공식 Newsroom의 최근 6개월 발표를 수집하고 분류한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.intel import fetch_intel_news


OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "intel_semiconductor.json"))


def main() -> None:
    collected = fetch_intel_news(days=180)
    rows = [
        {
            **article.to_dict(),
            "selection_method": "intel_official_newsroom_with_relevance_v1",
            "matched_keywords": matches,
            "source_category": category,
            "relevance": relevance,
        }
        for article, matches, category, relevance in collected
    ]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    high_count = sum(row["relevance"] == "high" for row in rows)
    print(f"Intel 최근 180일 전체 공식 발표: {len(rows)}건")
    print(f"공정·제조 관련: {high_count}건 / 기타 맥락: {len(rows) - high_count}건")
    print(f"저장 위치: {OUTPUT_PATH}")
    for row in rows[:5]:
        label = ", ".join(row["matched_keywords"]) or row["source_category"]
        print(f"- {row['published_at']} | {row['title']} [분류: {row['relevance']} / {label}]")


if __name__ == "__main__":
    main()

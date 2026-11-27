"""ASML 공식 자료의 최근 6개월 발표를 수집하고 분류한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.asml import fetch_asml_news


OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "asml_semiconductor.json"))


def main() -> None:
    collected = fetch_asml_news(days=180)
    rows = [
        {
            **article.to_dict(),
            "selection_method": "asml_official_sources_with_relevance_v1",
            "matched_keywords": matches,
            "source_category": content_type,
            "relevance": relevance,
        }
        for article, matches, content_type, relevance in collected
    ]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    high_count = sum(row["relevance"] == "high" for row in rows)
    print(f"ASML 최근 180일 전체 공식 발표: {len(rows)}건")
    print(f"장비·공정 관련: {high_count}건 / 기타 맥락: {len(rows) - high_count}건")
    print(f"저장 위치: {OUTPUT_PATH}")
    for row in rows:
        label = ", ".join(row["matched_keywords"]) or row["source_category"]
        print(f"- {row['published_at']} | {row['title']} [분류: {row['relevance']} / {label}]")


if __name__ == "__main__":
    main()

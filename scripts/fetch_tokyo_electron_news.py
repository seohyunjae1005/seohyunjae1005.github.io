"""Tokyo Electron 공식 뉴스룸을 수집하고 관련성을 분류한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.tokyo_electron import fetch_tokyo_electron_news

OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "tokyo_electron_semiconductor.json"))


def main() -> None:
    collected = fetch_tokyo_electron_news(days=180)
    rows = [
        {
            **article.to_dict(),
            "selection_method": "tel_official_newsroom_with_relevance_v1",
            "matched_keywords": matches,
            "source_category": categories or ["Newsroom"],
            "relevance": relevance,
        }
        for article, matches, categories, relevance in collected
    ]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    high_count = sum(row["relevance"] == "high" for row in rows)
    print(f"Tokyo Electron 최근 180일 공식 뉴스: {len(rows)}건")
    print(f"장비·공정 관련: {high_count}건 / 기타 맥락: {len(rows) - high_count}건")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

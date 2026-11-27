"""Lam Research 공식 보도자료를 수집하고 관련성을 분류한다."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.lam_research import fetch_lam_research_news

OUTPUT_PATH = Path(os.environ.get("NEWS_OUTPUT_PATH") or str(PROJECT_ROOT / "data" / "processed" / "lam_research_semiconductor.json"))


def main() -> None:
    collected = fetch_lam_research_news(days=180)
    rows = [
        {
            **article.to_dict(),
            "selection_method": "lam_cision_api_plus_technical_blog_v2",
            "matched_keywords": matches,
            "source_category": "Technology blog" if "blog=true" in article.url else "Press release",
            "relevance": relevance,
        }
        for article, matches, relevance in collected
    ]
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    high_count = sum(row["relevance"] == "high" for row in rows)
    print(f"Lam Research 최근 180일 공식 발표·기술 글: {len(rows)}건")
    print(f"장비·공정 관련: {high_count}건 / 기타 맥락: {len(rows) - high_count}건")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

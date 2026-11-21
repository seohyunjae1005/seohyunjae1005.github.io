"""통합 수집 결과를 GitHub Pages가 읽을 공개 데이터로 복사한다."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from trend_tracker.classification import (
    JOB_ROLE_ORDER,
    SIGNAL_TYPE_ORDER,
    TECH_DOMAIN_ORDER,
    enrich_article,
)
from trend_tracker.trend_summary import build_trend_summary, validate_trend_summary
from trend_tracker.monthly_report import attach_reports

INPUT_PATH = PROJECT_ROOT / "data" / "processed" / "latest_semiconductor_news.json"
OUTPUT_PATH = PROJECT_ROOT / "docs" / "data" / "latest.json"
TRANSLATION_CACHE_PATH = PROJECT_ROOT / "data" / "translations" / "ko.json"
ANALYSIS_CACHE_PATH = PROJECT_ROOT / "data" / "analysis" / "validated_cache.json"
MONTHLY_TREND_CACHE_PATH = PROJECT_ROOT / "data" / "analysis" / "monthly_trend_cache.json"


def _translation_cache() -> dict:
    if not TRANSLATION_CACHE_PATH.exists():
        return {}
    try:
        payload = json.loads(TRANSLATION_CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("경고: 번역 캐시가 손상되어 원문만 게시합니다.")
        return {}
    return payload.get("translations") or {}


def _validated_analysis_cache() -> tuple[dict, dict]:
    """공식 원문과 근거 검사를 통과한 회사별 분석만 읽는다."""
    if not ANALYSIS_CACHE_PATH.exists():
        return {}, {}
    try:
        payload = json.loads(ANALYSIS_CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("경고: AI 분석 캐시가 손상되어 분석 없이 게시합니다.")
        return {}, {}

    analyses: dict[str, dict] = {}
    for item in (payload.get("companies") or {}).values():
        if (
            isinstance(item, dict)
            and item.get("validation_status") == "PASS"
            and item.get("url")
            and isinstance(item.get("analysis"), dict)
        ):
            analyses[str(item["url"])] = item
    return analyses, payload


def _published_analysis_cache() -> dict[str, dict]:
    """직전 공개자료에 포함된 검증 완료 분석을 URL별로 보존한다."""
    if not OUTPUT_PATH.exists():
        return {}
    try:
        payload = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    analyses: dict[str, dict] = {}
    for article in payload.get("articles") or []:
        url = str(article.get("url") or "")
        analysis = article.get("ai_analysis")
        if (
            url
            and isinstance(analysis, dict)
            and analysis.get("validation_status") == "PASS"
            and isinstance(analysis.get("analysis"), dict)
        ):
            analyses[url] = analysis
    return analyses


def _monthly_trend_cache() -> dict:
    if not MONTHLY_TREND_CACHE_PATH.exists():
        return {}
    try:
        payload = json.loads(MONTHLY_TREND_CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("경고: 월간 AI 동향 캐시가 손상되어 통계 동향판만 게시합니다.")
        return {}
    if not isinstance(payload, dict):
        return {}
    return payload


def _fingerprint(article: dict) -> str:
    title = str(article.get("title") or "").strip()
    summary = str(article.get("summary") or "").strip()
    return hashlib.sha256(f"{title}\n{summary}".encode("utf-8")).hexdigest()


def main() -> None:
    if not INPUT_PATH.exists():
        raise SystemExit("통합 데이터가 없습니다. 먼저 run_daily_collection.py를 실행하세요.")

    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    translations = _translation_cache()
    latest_analyses, analysis_payload = _validated_analysis_cache()
    analyses = _published_analysis_cache()
    analyses.update(latest_analyses)
    published_articles: list[dict] = []
    translated_count = 0
    analyzed_count = 0
    for article in payload.get("articles", []):
        cached_analysis = analyses.get(str(article.get("url") or ""))
        classification_input = dict(article)
        if cached_analysis:
            classification_input["ai_analysis"] = {
                "analysis": cached_analysis["analysis"],
                "validation_status": cached_analysis["validation_status"],
                "source_scope": cached_analysis.get("source_scope")
                or "official_article_body",
            }
        enriched = enrich_article(classification_input)
        translated = translations.get(str(article.get("url") or ""))
        if (
            translated
            and translated.get("source_fingerprint") == _fingerprint(article)
            and translated.get("title_ko")
        ):
            enriched["title_ko"] = translated["title_ko"]
            enriched["summary_ko"] = translated.get("summary_ko") or ""
            enriched["translation_provider"] = "DeepL"
            translated_count += 1
        if cached_analysis:
            enriched["ai_analysis"] = {
                "analysis": cached_analysis["analysis"],
                "validation_status": cached_analysis["validation_status"],
                "review_status": cached_analysis.get("review_status") or "machine_validated",
                "source_scope": cached_analysis.get("source_scope") or "official_article_body",
                "generated_at": cached_analysis.get("generated_at"),
            }
            analyzed_count += 1
        published_articles.append(enriched)
    payload["articles"] = published_articles
    payload["article_count"] = len(payload["articles"])
    payload["filter_options"] = {
        "job_roles": list(JOB_ROLE_ORDER),
        "tech_domains": list(TECH_DOMAIN_ORDER),
        "signal_types": list(SIGNAL_TYPE_ORDER),
    }
    payload["translation"] = {
        "target_language": "ko",
        "provider": "DeepL",
        "translated_count": translated_count,
    }
    payload["ai_analysis"] = {
        "analyzed_count": analyzed_count,
        "cached_company_count": len(latest_analyses),
        "preserved_analysis_count": len(analyses),
        "updated_at": analysis_payload.get("updated_at"),
        "notice": "AI가 공식 원문을 바탕으로 작성하고 기계적으로 근거를 검사한 참고용 초안입니다.",
    }
    payload["trend_summary"] = build_trend_summary(
        payload["articles"], payload.get("generated_at")
    )
    trend_issues = validate_trend_summary(payload["trend_summary"], payload["articles"])
    if trend_issues:
        raise SystemExit("동향 집계 검증 실패: " + " / ".join(trend_issues))
    attach_reports(payload, _monthly_trend_cache())
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"웹 데이터 생성: {payload.get('article_count', 0)}건")
    print(f"AI 직무 분석 연결: {analyzed_count}건")
    print(
        "동향 집계: "
        + ", ".join(
            f"{days}일 {row['article_count']}건"
            for days, row in payload["trend_summary"]["windows"].items()
        )
    )
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

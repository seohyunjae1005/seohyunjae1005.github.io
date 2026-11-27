"""공개 대시보드 데이터의 누락·중복·출처·분류 품질을 검사한다."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "docs" / "data" / "latest.json"
DEFAULT_REPORT = PROJECT_ROOT / "docs" / "week2_quality_report.md"

OFFICIAL_DOMAINS = {
    "Samsung Electronics": ("samsung.com", "samsungsemiconductor.com"),
    "SK hynix": ("skhynix.com", "skhynix.co.kr"),
    "Kioxia": ("kioxia.com", "kioxia-holdings.com"),
    "Micron": ("micron.com",),
    "TSMC": ("tsmc.com",),
    "Intel": ("intel.com", "intc.com"),
    "ASML": ("asml.com",),
    "Applied Materials": ("appliedmaterials.com",),
    "Lam Research": ("lamresearch.com",),
    "Tokyo Electron": ("tel.com",),
    "KLA": ("kla.com",),
}

REQUIRED_FIELDS = ("company", "title", "url", "published_at")
CLASSIFICATION_FIELDS = (
    "relevance",
    "job_roles",
    "tech_domains",
    "signal_types",
    "classification_version",
)


def parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_title(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").casefold()).strip()


def is_official_url(company: str, url: str) -> bool:
    hostname = (urlparse(url).hostname or "").casefold()
    allowed = OFFICIAL_DOMAINS.get(company, ())
    return any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed)


def markdown_text(value: object) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def build_report(payload: dict) -> tuple[dict, str]:
    articles = payload.get("articles")
    if not isinstance(articles, list):
        articles = []

    generated_at = parse_datetime(payload.get("generated_at")) or datetime.now(timezone.utc)
    errors: list[str] = []
    warnings: list[str] = []
    field_missing: Counter[str] = Counter()
    invalid_dates: list[str] = []
    future_dates: list[str] = []
    old_dates: list[str] = []
    unofficial_urls: list[str] = []
    duplicate_urls: list[str] = []
    duplicate_titles: list[str] = []
    seen_urls: set[str] = set()
    seen_titles: set[tuple[str, str, str]] = set()
    actual_company_counts: Counter[str] = Counter()
    role_counts: Counter[str] = Counter()
    domain_counts: Counter[str] = Counter()
    signal_counts: Counter[str] = Counter()
    company_articles: dict[str, list[dict]] = defaultdict(list)

    for index, article in enumerate(articles, start=1):
        if not isinstance(article, dict):
            errors.append(f"{index}번째 기사가 객체 형식이 아닙니다.")
            continue

        for field in REQUIRED_FIELDS:
            if not article.get(field):
                field_missing[field] += 1
        for field in CLASSIFICATION_FIELDS:
            if not article.get(field):
                field_missing[field] += 1

        company = str(article.get("company") or "Unknown")
        title = str(article.get("title") or "")
        url = str(article.get("url") or "")
        actual_company_counts[company] += 1

        if url:
            if url in seen_urls:
                duplicate_urls.append(url)
            seen_urls.add(url)
            if company in OFFICIAL_DOMAINS and not is_official_url(company, url):
                unofficial_urls.append(f"{company}: {url}")

        title_key = (company, normalize_title(title), str(article.get("published_at") or "")[:10])
        if title_key[1]:
            if title_key in seen_titles:
                duplicate_titles.append(f"{company}: {title}")
            seen_titles.add(title_key)

        published_at = parse_datetime(article.get("published_at"))
        if published_at is None:
            invalid_dates.append(f"{company}: {title}")
        else:
            if published_at > generated_at + timedelta(days=2):
                future_dates.append(f"{company}: {title}")
            if published_at < generated_at - timedelta(days=190):
                old_dates.append(f"{company}: {title}")

        role_counts.update(article.get("job_roles") or [])
        domain_counts.update(article.get("tech_domains") or [])
        signal_counts.update(article.get("signal_types") or [])

        company_articles[company].append(article)

    samples: dict[str, list[dict]] = {}
    for company, company_rows in company_articles.items():
        selected: list[dict] = []
        for relevance in ("high", "context"):
            match = next(
                (
                    article
                    for article in company_rows
                    if article.get("relevance") == relevance
                ),
                None,
            )
            if match is not None and match not in selected:
                selected.append(match)
        for article in company_rows:
            if len(selected) >= 2:
                break
            if article not in selected:
                selected.append(article)
        samples[company] = selected

    declared_count = payload.get("article_count")
    if declared_count != len(articles):
        errors.append(f"article_count={declared_count}, 실제 배열={len(articles)}로 일치하지 않습니다.")

    declared_company_counts = payload.get("company_counts") or {}
    nonzero_declared = {company: count for company, count in declared_company_counts.items() if count != 0}
    if dict(actual_company_counts) != nonzero_declared:
        errors.append("company_counts와 실제 회사별 기사 수가 일치하지 않습니다.")

    for source in payload.get("collection_sources") or []:
        company = source.get("company")
        if source.get("article_count") != actual_company_counts.get(company, 0):
            errors.append(f"{company}: 수집 현황의 기사 수 불일치")
        if source.get("status") == "updated" and (not source.get("source_checks") or any(
                check.get("status") != "ok" for check in source["source_checks"])):
            errors.append(f"{company}: 경로 검사 실패를 정상 갱신으로 표시")

    if field_missing:
        errors.append(f"필수값 또는 분류값 누락: {dict(field_missing)}")
    if duplicate_urls:
        errors.append(f"중복 URL {len(duplicate_urls)}건")
    if duplicate_titles:
        errors.append(f"동일 회사 내 중복 제목 {len(duplicate_titles)}건")
    if invalid_dates:
        errors.append(f"해석할 수 없는 게시일 {len(invalid_dates)}건")
    if future_dates:
        warnings.append(f"생성 시점보다 2일 이상 미래인 게시물 {len(future_dates)}건")
    if old_dates:
        warnings.append(f"190일보다 오래된 게시물 {len(old_dates)}건")
    if unofficial_urls:
        errors.append(f"등록된 공식 도메인을 벗어난 URL {len(unofficial_urls)}건")

    collection_status = payload.get("collection_status") or {}
    fallback_sources = {
        name: status
        for name, status in collection_status.items()
        if status != "updated"
    }
    if fallback_sources:
        warnings.append(f"최신 수집 대신 캐시 또는 오류 상태인 수집기 {len(fallback_sources)}개")

    classified_count = sum(
        all(article.get(field) for field in CLASSIFICATION_FIELDS)
        for article in articles
        if isinstance(article, dict)
    )
    official_count = sum(
        is_official_url(str(article.get("company") or ""), str(article.get("url") or ""))
        for article in articles
        if isinstance(article, dict)
    )
    status = "FAIL" if errors else ("WARN" if warnings else "PASS")

    result = {
        "status": status,
        "generated_at": generated_at.isoformat(),
        "article_count": len(articles),
        "company_count": len(actual_company_counts),
        "official_url_count": official_count,
        "classified_count": classified_count,
        "errors": errors,
        "warnings": warnings,
        "fallback_sources": fallback_sources,
        "company_counts": dict(actual_company_counts),
        "job_role_counts": dict(role_counts),
        "tech_domain_counts": dict(domain_counts),
        "signal_type_counts": dict(signal_counts),
        "details": {
            "unofficial_urls": unofficial_urls,
            "duplicate_urls": duplicate_urls,
            "duplicate_titles": duplicate_titles,
            "invalid_dates": invalid_dates,
            "future_dates": future_dates,
            "old_dates": old_dates,
        },
    }

    lines = [
        "# 2주차 데이터 품질검사 결과",
        "",
        f"- 검사 상태: **{status}**",
        f"- 검사 기준 데이터 생성 시각: {generated_at.isoformat()}",
        f"- 기사 수: {len(articles)}건",
        f"- 추적 기업: {len(actual_company_counts)}개",
        f"- 공식 도메인 연결: {official_count}/{len(articles)}건",
        f"- 직무·기술 분류 완료: {classified_count}/{len(articles)}건",
        "",
        "## 자동검사 결과",
        "",
    ]
    if not errors and not warnings:
        lines.append("- 오류 및 경고 없음")
    else:
        lines.extend(f"- 오류: {message}" for message in errors)
        lines.extend(f"- 경고: {message}" for message in warnings)

    lines.extend(["", "## 회사별 기사 수", "", "| 회사 | 기사 수 |", "|---|---:|"])
    lines.extend(f"| {markdown_text(company)} | {count} |" for company, count in actual_company_counts.items())

    lines.extend(
        [
            "",
            "## 사람 검토용 표본",
            "",
            "자동검사는 형식 오류를 찾는 단계이며, 아래 표본의 관련성과 분류는 사람이 원문과 비교해 확인한다.",
            "",
            "| 회사 | 제목 | 중요도 | 관련 직무 | 기술 분야 | 사람 검토 |",
            "|---|---|---|---|---|---|",
        ]
    )
    for company, company_samples in samples.items():
        for article in company_samples:
            lines.append(
                "| "
                + " | ".join(
                    [
                        markdown_text(company),
                        markdown_text(article.get("title")),
                        markdown_text(article.get("relevance")),
                        markdown_text(", ".join(article.get("job_roles") or [])),
                        markdown_text(", ".join(article.get("tech_domains") or [])),
                        "적합 / 수정 필요",
                    ]
                )
                + " |"
            )

    lines.extend(
        [
            "",
            "## 판단 기준",
            "",
            "- PASS: 구조·중복·날짜·공식 출처·분류 필수값 검사에서 이상이 없음",
            "- WARN: 캐시 사용이나 날짜 범위처럼 확인이 필요한 항목이 있음",
            "- FAIL: 누락, 중복, 비공식 출처 등 수정이 필요한 오류가 있음",
            "- 자동 분류 정확도는 위 표본을 원문과 비교한 뒤 별도로 기록해야 함",
            "",
        ]
    )
    return result, "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="공개 반도체 기사 데이터 품질검사")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--json", type=Path, help="선택: 상세 JSON 결과 저장 경로")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    result, markdown = build_report(payload)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(markdown, encoding="utf-8")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print("=== 데이터 품질검사 완료 ===")
    print(f"상태: {result['status']}")
    print(f"기사: {result['article_count']}건 / 기업: {result['company_count']}개")
    print(
        f"공식 도메인: {result['official_url_count']}/{result['article_count']}건"
    )
    print(
        f"직무·기술 분류: {result['classified_count']}/{result['article_count']}건"
    )
    for message in result["errors"]:
        print(f"오류: {message}")
    for message in result["warnings"]:
        print(f"경고: {message}")
    print(f"보고서: {args.report}")


if __name__ == "__main__":
    main()

"""검증된 기사 분류를 7·30·90일 산업 동향 통계로 집계한다."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone


WINDOW_DAYS = (7, 30, 90)
GENERIC_TECH_DOMAINS = {"기업·산업 일반"}
GENERIC_JOB_ROLES = {"산업·사업 공통"}


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _top(counter: Counter, limit: int = 5) -> list[dict]:
    return [
        {"name": name, "count": count}
        for name, count in sorted(
            counter.items(), key=lambda item: (-item[1], item[0])
        )[:limit]
    ]


def _window_articles(
    articles: list[dict], reference: datetime, start_days: int, end_days: int = 0
) -> list[dict]:
    newest = reference - timedelta(days=end_days)
    oldest = reference - timedelta(days=start_days)
    selected = []
    for article in articles:
        published = _parse_datetime(article.get("published_at"))
        if published is not None and oldest <= published <= newest:
            selected.append(article)
    return selected


def _count_list_values(articles: list[dict], field: str, excluded: set[str]) -> Counter:
    counts: Counter = Counter()
    for article in articles:
        for value in article.get(field) or []:
            if isinstance(value, str) and value and value not in excluded:
                counts[value] += 1
    return counts


def _summarize_window(articles: list[dict]) -> dict:
    high_articles = [row for row in articles if row.get("relevance") == "high"]
    return {
        "article_count": len(articles),
        "high_relevance_count": len(high_articles),
        "company_count": len({row.get("company") for row in articles if row.get("company")}),
        "top_companies": _top(Counter(row.get("company") for row in high_articles if row.get("company"))),
        "top_tech_domains": _top(
            _count_list_values(high_articles, "tech_domains", GENERIC_TECH_DOMAINS)
        ),
        "top_job_roles": _top(
            _count_list_values(high_articles, "job_roles", GENERIC_JOB_ROLES)
        ),
        "top_signal_types": _top(
            _count_list_values(high_articles, "signal_types", set())
        ),
    }


def _momentum(current: Counter, previous: Counter, limit: int = 5) -> list[dict]:
    rows = []
    for name in set(current) | set(previous):
        current_count = current.get(name, 0)
        previous_count = previous.get(name, 0)
        delta = current_count - previous_count
        if current_count <= 0 or delta <= 0:
            continue
        rows.append(
            {
                "name": name,
                "current_count": current_count,
                "previous_count": previous_count,
                "delta": delta,
            }
        )
    return sorted(
        rows,
        key=lambda row: (-row["delta"], -row["current_count"], row["name"]),
    )[:limit]


def _company_profiles(articles: list[dict], limit: int = 11) -> list[dict]:
    profiles = []
    companies = sorted({row.get("company") for row in articles if row.get("company")})
    for company in companies:
        company_rows = [
            row
            for row in articles
            if row.get("company") == company and row.get("relevance") == "high"
        ]
        if not company_rows:
            continue
        profiles.append(
            {
                "company": company,
                "high_relevance_count": len(company_rows),
                "top_tech_domains": _top(
                    _count_list_values(company_rows, "tech_domains", GENERIC_TECH_DOMAINS),
                    limit=3,
                ),
                "top_job_roles": _top(
                    _count_list_values(company_rows, "job_roles", GENERIC_JOB_ROLES),
                    limit=3,
                ),
            }
        )
    return sorted(
        profiles,
        key=lambda row: (-row["high_relevance_count"], row["company"]),
    )[:limit]


def build_trend_summary(articles: list[dict], generated_at: str | None) -> dict:
    reference = _parse_datetime(generated_at)
    if reference is None:
        dates = [_parse_datetime(row.get("published_at")) for row in articles]
        reference = max((value for value in dates if value is not None), default=datetime.now(timezone.utc))

    windows = {
        str(days): _summarize_window(_window_articles(articles, reference, days))
        for days in WINDOW_DAYS
    }
    for days in WINDOW_DAYS:
        windows[str(days)]["company_profiles"] = _company_profiles([
            row for row in _window_articles(articles, reference, days)
            if row.get("relevance") == "high"
        ])
    current_30 = [
        row
        for row in _window_articles(articles, reference, 30)
        if row.get("relevance") == "high"
    ]
    previous_30 = [
        row
        for row in _window_articles(articles, reference, 60, 30)
        if row.get("relevance") == "high"
    ]

    current_domains = _count_list_values(
        current_30, "tech_domains", GENERIC_TECH_DOMAINS
    )
    previous_domains = _count_list_values(
        previous_30, "tech_domains", GENERIC_TECH_DOMAINS
    )
    current_roles = _count_list_values(current_30, "job_roles", GENERIC_JOB_ROLES)
    previous_roles = _count_list_values(previous_30, "job_roles", GENERIC_JOB_ROLES)

    return {
        "reference_at": reference.isoformat(),
        "methodology": (
            "공식 기사 중 핵심 기술로 분류된 기사만 기술·직무 빈도에 사용하며, "
            "최근 30일과 직전 30일의 기사 건수 차이를 상승 신호로 계산합니다."
        ),
        "windows": windows,
        "momentum_30d": {
            "current_period_days": 30,
            "comparison_period_days": 30,
            "tech_domains": _momentum(current_domains, previous_domains),
            "job_roles": _momentum(current_roles, previous_roles),
        },
        "company_profiles_30d": _company_profiles(current_30),
    }


def validate_trend_summary(summary: dict, articles: list[dict]) -> list[str]:
    issues = []
    windows = summary.get("windows")
    if not isinstance(windows, dict):
        return ["기간별 집계가 없습니다."]
    previous_count = -1
    for days in WINDOW_DAYS:
        row = windows.get(str(days))
        if not isinstance(row, dict):
            issues.append(f"최근 {days}일 집계가 없습니다.")
            continue
        count = row.get("article_count")
        if not isinstance(count, int) or count < 0 or count > len(articles):
            issues.append(f"최근 {days}일 기사 수가 허용 범위를 벗어났습니다.")
            continue
        if count < previous_count:
            issues.append("더 긴 기간의 기사 수가 더 적습니다.")
        previous_count = count
        high_count = row.get("high_relevance_count")
        if not isinstance(high_count, int) or high_count < 0 or high_count > count:
            issues.append(f"최근 {days}일 핵심 기사 수가 잘못되었습니다.")
    return issues

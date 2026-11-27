"""우선순위 기업의 최신 뉴스를 한 번에 수집하고 통합한다."""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
COLLECTORS = (
    PROJECT_ROOT / "scripts" / "fetch_samsung_news.py",
    PROJECT_ROOT / "scripts" / "fetch_skhynix_news.py",
    PROJECT_ROOT / "scripts" / "fetch_kioxia_news.py",
    PROJECT_ROOT / "scripts" / "fetch_micron_news.py",
    PROJECT_ROOT / "scripts" / "fetch_tsmc_news.py",
    PROJECT_ROOT / "scripts" / "fetch_intel_news.py",
    PROJECT_ROOT / "scripts" / "fetch_asml_news.py",
    PROJECT_ROOT / "scripts" / "fetch_applied_materials_news.py",
    PROJECT_ROOT / "scripts" / "fetch_lam_research_news.py",
    PROJECT_ROOT / "scripts" / "fetch_tokyo_electron_news.py",
    PROJECT_ROOT / "scripts" / "fetch_kla_news.py",
)
INPUT_PATHS = (
    PROJECT_ROOT / "data" / "processed" / "samsung_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "sk_hynix_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "kioxia_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "micron_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "tsmc_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "intel_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "asml_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "applied_materials_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "lam_research_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "tokyo_electron_semiconductor.json",
    PROJECT_ROOT / "data" / "processed" / "kla_semiconductor.json",
)
COMPANIES = (
    "Samsung Electronics",
    "SK hynix",
    "Kioxia",
    "Micron",
    "TSMC",
    "Intel",
    "ASML",
    "Applied Materials",
    "Lam Research",
    "Tokyo Electron",
    "KLA",
)
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "latest_semiconductor_news.json"
PUBLISHED_PATH = PROJECT_ROOT / "docs" / "data" / "latest.json"


def usable_rows(rows: list[dict], now: datetime) -> list[dict]:
    """실패 시 보존하는 자료도 실제 발표일과 180일 범위를 검사한다."""
    result = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            published = datetime.fromisoformat(str(row.get("published_at", "")).replace("Z", "+00:00"))
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
        if now - timedelta(days=180) <= published <= now and row.get("url") and row.get("title"):
            result.append(row)
    return result


def source_urls() -> dict[str, str]:
    """의존성 없이 이 프로젝트의 단순 YAML 출처 목록을 읽는다."""
    urls, identifier = {}, ""
    for line in (PROJECT_ROOT / "config/sources.yaml").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("- id:"):
            identifier = line.split(":", 1)[1].strip()
        elif line.strip().startswith("official_url:"):
            urls[identifier] = line.split(":", 1)[1].strip().strip('"')
    return urls


def _published_sort_value(article: dict) -> str:
    return article.get("published_at") or ""


def main() -> None:
    print("=== 우선순위 기업 최신 뉴스 수집 시작 ===")
    now = datetime.now(timezone.utc)
    previous_payload = {}
    published_by_company: dict[str, list[dict]] = {}
    if PUBLISHED_PATH.exists():
        try:
            previous_payload = json.loads(PUBLISHED_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous_payload = {}
            print("경고: 직전 공개자료가 완전한 JSON이 아니어서 캐시로 사용하지 않습니다.")
        for row in usable_rows(previous_payload.get("articles", []), now):
            company = row.get("company", "Unknown")
            published_by_company.setdefault(company, []).append(row)

    collection_status: dict[str, str] = {}
    collection_sources = []
    previous_sources = {row["company"]: row for row in previous_payload.get("collection_sources", [])}
    official_urls = source_urls()
    for collector, output_path, company in zip(COLLECTORS, INPUT_PATHS, COMPANIES):
        print(f"\n[{collector.stem}]")
        result = subprocess.run(
            [sys.executable, str(collector)], cwd=PROJECT_ROOT, check=False
        )
        try:
            fresh_rows = usable_rows(json.loads(output_path.read_text(encoding="utf-8")), now) if output_path.exists() else []
        except (ValueError, TypeError):
            fresh_rows = []
        succeeded = result.returncode == 0 and bool(fresh_rows)
        if succeeded:
            collection_status[collector.stem] = "updated"
        elif fresh_rows:
            collection_status[collector.stem] = "cached_after_error"
            print(
                f"경고: 새 수집에 실패해 기존 저장자료를 사용합니다: {output_path.name}"
            )
        elif published_by_company.get(company):
            fallback_rows = published_by_company[company]
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(fallback_rows, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            collection_status[collector.stem] = "published_cache_after_error"
            print(
                f"경고: 새 수집에 실패해 직전 공개자료 {len(fallback_rows)}건을 사용합니다."
            )
        else:
            collection_status[collector.stem] = "unavailable"
            print("경고: 새 수집에 실패했고 기존 저장자료도 없어 이번 통합에서 제외합니다.")

        # 저장된 실행 중간 파일보다 직전 공개본이 더 풍부할 수 있다.
        # 새 자료를 우선하고, 180일 이내의 이전 기사·검증 분석을 함께 보존한다.
        merged = {row["url"]: row for row in published_by_company.get(company, [])}
        merged.update({row["url"]: row for row in fresh_rows})
        rows = sorted(merged.values(), key=_published_sort_value, reverse=True)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        source_id = collector.stem.removeprefix("fetch_").removesuffix("_news")
        source_id = {"skhynix": "sk_hynix"}.get(source_id, source_id)
        collection_sources.append({
            "source_id": source_id, "company": company,
            "official_url": official_urls.get(source_id, ""),
            "status": "updated" if succeeded else "cached_after_error" if rows else "unavailable",
            "attempted_at": datetime.now(timezone.utc).isoformat(),
            "last_success_at": datetime.now(timezone.utc).isoformat() if succeeded else previous_sources.get(company, {}).get("last_success_at"),
            "latest_published_at": rows[0].get("published_at") if rows else None,
            "article_count": len(rows),
        })
        if not succeeded:
            collection_status[collector.stem] = "cached_after_error" if rows else "unavailable"
            print(f"::warning title={company} 뉴스 갱신 지연::새 기사를 확인하지 못했습니다. 기존 자료 {len(rows)}건을 보존합니다.")

    combined: list[dict] = []
    seen_urls: set[str] = set()
    seen_company_titles: set[tuple[str, str]] = set()
    company_counts: dict[str, int] = dict.fromkeys(COMPANIES, 0)
    for path in INPUT_PATHS:
        if not path.exists():
            continue
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            url = row.get("url", "")
            company = row.get("company", "Unknown")
            normalized_title = " ".join(row.get("title", "").casefold().split())
            title_key = (company, normalized_title)
            if not url or url in seen_urls or title_key in seen_company_titles:
                continue
            seen_urls.add(url)
            seen_company_titles.add(title_key)
            combined.append(row)
            company_counts[company] = company_counts.get(company, 0) + 1

    combined.sort(key=_published_sort_value, reverse=True)
    for source in collection_sources:
        rows = [row for row in combined if row.get("company") == source["company"]]
        source["article_count"] = len(rows)
        source["latest_published_at"] = rows[0].get("published_at") if rows else None
        source["manual_reviewed_at"] = max((row.get("manual_reviewed_at") or "" for row in rows), default="") or None
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "article_count": len(combined),
        "company_counts": company_counts,
        "collection_status": collection_status,
        "collection_sources": collection_sources,
        "articles": combined,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n=== 통합 완료 ===")
    print(f"기업별 후보: {company_counts}")
    print(f"통합 기사: {len(combined)}건")
    print(f"수집 상태: {collection_status}")
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

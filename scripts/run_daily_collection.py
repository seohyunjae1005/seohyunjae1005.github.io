"""우선순위 기업의 최신 뉴스를 한 번에 수집하고 통합한다."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))
from scripts.validate_data_quality import is_official_url
from trend_tracker.news_identity import same_story, title_key
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
        if not isinstance(row.get("title"), str) or not isinstance(row.get("url"), str):
            continue
        if not row["url"].startswith("https://") or not is_official_url(str(row.get("company") or ""), row["url"]):
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


def run_collector(collector: Path, company: str, now: datetime) -> dict:
    runtime = PROJECT_ROOT / "runtime"
    runtime.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="news-", dir=runtime) as folder:
        folder = Path(folder)
        output, health_file = folder / "articles.json", folder / "health.json"
        env = {**os.environ, "NEWS_OUTPUT_PATH": str(output), "NEWS_HEALTH_PATH": str(health_file), "PYTHONUTF8": "1"}
        try:
            result = subprocess.run([sys.executable, str(collector)], cwd=PROJECT_ROOT,
                env=env, timeout=180, check=False, capture_output=True, text=True, encoding="utf-8", errors="replace")
            code, log = result.returncode, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            code, log = 124, "수집 제한 시간 초과"
        logs = runtime / "news_collection_logs"
        logs.mkdir(exist_ok=True)
        (logs / f"{collector.stem}.txt").write_text(log, encoding="utf-8")
        try:
            raw = json.loads(output.read_text(encoding="utf-8"))
            rows = [row for row in usable_rows(raw, now) if row.get("company") == company] if isinstance(raw, list) else []
        except (OSError, ValueError, TypeError):
            raw, rows = [], []
        try:
            health = json.loads(health_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            health = {}
        (logs / f"{collector.stem}-health.json").write_text(json.dumps(health, ensure_ascii=False, indent=2), encoding="utf-8")
        checks = health.get("channels") or [{"name": "수집 경로 확인", "status": "failed", "error": "MissingChannelChecks"}]
        if isinstance(raw, list) and len(rows) != len(raw):
            checks.append({"name": "기사 날짜·출처 검사", "status": "failed", "error": "InvalidArticleRows"})
        return {"returncode": code, "rows": rows if code == 0 else [], "checks": checks,
                "retry_count": sum(max(0, row.get("attempts", 1) - 1) for row in health.get("requests", []))
                    + sum(max(0, row.get("attempts", 1) - 1) for row in checks)}


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
    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(lambda pair: run_collector(pair[0], pair[1], now), zip(COLLECTORS, COMPANIES)))
    for collector, output_path, company, result in zip(COLLECTORS, INPUT_PATHS, COMPANIES, results):
        print(f"\n[{collector.stem}]")
        fresh_rows = result["rows"]
        succeeded = bool(fresh_rows) and all(check.get("status") == "ok" for check in result["checks"])

        # 저장된 실행 중간 파일보다 직전 공개본이 더 풍부할 수 있다.
        # 새 자료를 우선하고, 180일 이내의 이전 기사·검증 분석을 함께 보존한다.
        merged = {row["url"]: row for row in published_by_company.get(company, [])}
        merged.update({row["url"]: row for row in fresh_rows})
        rows = sorted(merged.values(), key=_published_sort_value, reverse=True)
        status = "updated" if succeeded else "partial" if fresh_rows else "cached_after_error" if rows else "unavailable"
        collection_status[collector.stem] = status
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        source_id = collector.stem.removeprefix("fetch_").removesuffix("_news")
        source_id = {"skhynix": "sk_hynix"}.get(source_id, source_id)
        collection_sources.append({
            "source_id": source_id, "company": company,
            "official_url": official_urls.get(source_id, ""),
            "status": status,
            "source_checks": result["checks"],
            "retry_count": result["retry_count"],
            "fresh_article_count": len(fresh_rows),
            "consecutive_failures": 0 if succeeded else previous_sources.get(company, {}).get("consecutive_failures", 0) + 1,
            "attempted_at": datetime.now(timezone.utc).isoformat(),
            "last_success_at": datetime.now(timezone.utc).isoformat() if succeeded else previous_sources.get(company, {}).get("last_success_at"),
            "latest_published_at": rows[0].get("published_at") if rows else None,
            "article_count": len(rows),
        })
        if not succeeded:
            print(f"::warning title={company} 뉴스 갱신 지연::상태 {status}. 새 수집 {len(fresh_rows)}건, 보존 자료 포함 {len(rows)}건.")
        else:
            print(f"모든 경로 확인: {len(result['checks'])}개, 수집 {len(fresh_rows)}건")

    combined: list[dict] = []
    seen_urls: set[str] = set()
    seen_company_titles: dict[tuple[str, str], list[dict]] = {}
    company_counts: dict[str, int] = dict.fromkeys(COMPANIES, 0)
    for path in INPUT_PATHS:
        if not path.exists():
            continue
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            url = row.get("url", "")
            company = row.get("company", "Unknown")
            key = title_key(row)
            if not url or url in seen_urls or any(same_story(row, previous) for previous in seen_company_titles.get(key, [])):
                continue
            seen_urls.add(url)
            seen_company_titles.setdefault(key, []).append(row)
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

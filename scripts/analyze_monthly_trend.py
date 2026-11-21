"""7·30·90일의 개별 근거로 AI 리포트를 생성하고 검증한다."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from analyze_sample_articles import DEFAULT_MODEL, call_gemini
from trend_tracker.monthly_report import (
    attach_reports,
    build_evidence_pack,
    build_monthly_prompt,
    evidence_fingerprint,
    validate_monthly_report,
)
from trend_tracker.trend_summary import build_trend_summary


WEB_DATA_PATH = PROJECT_ROOT / "docs" / "data" / "latest.json"
CACHE_PATH = PROJECT_ROOT / "data" / "analysis" / "monthly_trend_cache.json"
REPORT_PATH = PROJECT_ROOT / "runtime" / "monthly_trend_validation.md"


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    payload = json.loads(WEB_DATA_PATH.read_text(encoding="utf-8"))
    reference_at = (payload.get("trend_summary") or {}).get("reference_at") or payload.get("generated_at")
    payload["trend_summary"] = build_trend_summary(payload.get("articles", []), reference_at)
    try:
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    if not isinstance(cache, dict):
        cache = {}
    entries = cache.get("reports")
    if not isinstance(entries, dict):
        entries = {"30": cache} if cache.get("report") else {}
    cache = {"reports": entries}
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    notes = ["# 기간별 AI 리포트 검증", ""]
    failures = []
    calls = 0
    for days in (7, 30, 90):
        pack = build_evidence_pack(payload, days)
        fingerprint = evidence_fingerprint(pack)
        cached = entries.get(str(days))
        if (
            isinstance(cached, dict)
            and cached.get("source_fingerprint") == fingerprint
            and cached.get("validation_status") == "PASS"
            and not validate_monthly_report(cached.get("report"), pack)
        ):
            notes.append(f"- 최근 {days}일: 기존 근거 일치, 캐시 사용")
            continue
        if not pack["metrics"] or not pack["articles"]:
            entries.pop(str(days), None)
            notes.append(f"- 최근 {days}일: 분석 근거 부족")
            continue
        try:
            if not api_key:
                raise ValueError("GEMINI_API_KEY가 없습니다.")
            calls += 1
            report, used_model = call_gemini(build_monthly_prompt(pack), api_key, model)
            issues = validate_monthly_report(report, pack)
            if issues:
                raise ValueError(" / ".join(issues))
            entries[str(days)] = {
                "source_fingerprint": fingerprint,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "model": used_model,
                "validation_status": "PASS",
                "report": report,
                "evidence": pack,
            }
            write_json(CACHE_PATH, cache)
            notes.append(
                f"- 최근 {days}일: PASS, 통계 {len(pack['metrics'])}개, 기사 {len(pack['articles'])}개"
            )
        except Exception as error:
            failures.append(f"최근 {days}일: {type(error).__name__}")
            notes.append(f"- 최근 {days}일: FAIL ({type(error).__name__}: {str(error)[:300]})")
    attach_reports(payload, cache)
    write_json(CACHE_PATH, cache)
    write_json(WEB_DATA_PATH, payload)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    notes.append(f"- API 요청 작업: {calls}회")
    REPORT_PATH.write_text("\n".join(notes) + "\n", encoding="utf-8")
    print("\n".join(notes))
    if failures:
        raise SystemExit("기간별 리포트 일부 생성 실패: " + " / ".join(failures))


if __name__ == "__main__":
    main()

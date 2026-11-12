"""최근 30일 통계로 근거 ID가 검증되는 AI 종합 리포트를 한 번 생성한다."""

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
    build_evidence_pack,
    build_monthly_prompt,
    evidence_fingerprint,
    validate_monthly_report,
)


WEB_DATA_PATH = PROJECT_ROOT / "docs" / "data" / "latest.json"
CACHE_PATH = PROJECT_ROOT / "data" / "analysis" / "monthly_trend_cache.json"
REPORT_PATH = PROJECT_ROOT / "runtime" / "monthly_trend_validation.md"


def attach_to_web_data(payload: dict, cache: dict) -> None:
    payload["monthly_trend_report"] = {
        "generated_at": cache.get("generated_at"),
        "model": cache.get("model"),
        "report": cache.get("report"),
        "evidence": cache.get("evidence"),
        "notice": "공식 기사 통계와 제목만 사용하고 근거 ID를 자동 검사한 AI 참고용 리포트입니다.",
    }
    WEB_DATA_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    payload = json.loads(WEB_DATA_PATH.read_text(encoding="utf-8"))
    pack = build_evidence_pack(payload)
    fingerprint = evidence_fingerprint(pack)
    if CACHE_PATH.exists():
        try:
            cached = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            cached = {}
        if (
            cached.get("source_fingerprint") == fingerprint
            and cached.get("validation_status") == "PASS"
        ):
            attach_to_web_data(payload, cached)
            print("동향 근거가 이전 실행과 같아 기존 리포트를 사용합니다. API 호출: 0회")
            return

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("GEMINI_API_KEY가 없습니다. GitHub Actions 비밀키를 확인하세요.")
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    report, used_model = call_gemini(build_monthly_prompt(pack), api_key, model)
    issues = validate_monthly_report(report, pack)
    status = "PASS" if not issues else "FAIL"
    generated_at = datetime.now(timezone.utc).isoformat()
    cache = {
        "report_version": report.get("report_version"),
        "source_fingerprint": fingerprint,
        "generated_at": generated_at,
        "model": used_model,
        "validation_status": status,
        "validation_issues": issues,
        "report": report,
        "evidence": pack,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        "\n".join(
            [
                "# 월간 AI 동향 리포트 검증",
                "",
                f"- 상태: **{status}**",
                f"- 모델: `{used_model}`",
                f"- 통계 근거: {len(pack['metrics'])}개",
                f"- 기사 제목 근거: {len(pack['articles'])}개",
                *(f"- [FAIL] {issue}" for issue in issues),
                "",
            ]
        ),
        encoding="utf-8",
    )
    if issues:
        raise SystemExit("월간 리포트 검증 실패: " + " / ".join(issues))
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    attach_to_web_data(payload, cache)
    print("월간 AI 동향 리포트 생성 및 근거 ID 검증: PASS")
    print("Gemini API 호출: 1회")


if __name__ == "__main__":
    main()

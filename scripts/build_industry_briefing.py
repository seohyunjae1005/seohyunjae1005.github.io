"""공식 원문을 갱신하고 인용 검증을 통과한 산업 브리핑만 게시한다."""

from __future__ import annotations

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from analyze_sample_articles import DEFAULT_MODEL, call_gemini
from trend_tracker.industry_briefing import (
    build_prompt, build_review_prompt, discover_candidates, fetch_text, fingerprint, prepare_sources,
    public_document, source_from_html, validate_report, validate_review,
)

INPUT = ROOT / "docs/data/latest.json"
OUTPUT = ROOT / "docs/data/industry-briefing.json"
BACKGROUND = ROOT / "data/industry/background_sources.json"
RUNTIME = ROOT / "runtime/industry_sources.json"
NOTES = ROOT / "runtime/industry_briefing_validation.json"


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def collect(payload, now):
    candidates, failures = discover_candidates(payload, now)

    def extract(candidate):
        try:
            return source_from_html(candidate, fetch_text(candidate["url"]), now), None
        except Exception as error:
            return None, f"{candidate['publisher']}: {type(error).__name__}"

    rows = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for source, error in executor.map(extract, candidates):
            if source:
                rows.append(source)
            if error:
                failures.append(error)
    known_urls = {row["url"] for row in rows}
    rows.extend(row for row in json.loads(BACKGROUND.read_text(encoding="utf-8"))["sources"]
                if row["url"] not in known_urls)
    return prepare_sources(rows, now), failures


def main():
    now = datetime.now(timezone.utc)
    timestamp = now.isoformat()
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    sources, failures = collect(payload, now)
    save(RUNTIME, sources)
    print(f"확보한 출처: {len(sources)}개")
    for source in sources:
        print(f"- {source['id']} {source['publisher']} / {source['published_at']} / {source['scope']}")
    try:
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {}
    notes = {"checked_at": timestamp, "source_count": len(sources), "fetch_failures": failures}
    try:
        kinds = {s["kind"] for s in sources}
        if len(sources) < 5 or not {"산업 통계", "연구보고서", "기업 발표"} <= kinds:
            raise ValueError("기업·산업 통계·연구보고서의 본문 근거가 충분하지 않음")
        source_hash = fingerprint(sources)
        if previous.get("source_fingerprint") == source_hash and not validate_report(previous, sources):
            result = public_document(previous, sources, previous["generated_at"], timestamp, failures)
            notes["result"] = "근거 일치: 기존 브리핑 유지"
        else:
            key = os.environ.get("GEMINI_API_KEY", "").strip()
            if not key:
                raise ValueError("GEMINI_API_KEY가 없습니다.")
            model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
            base_prompt = build_prompt(sources)
            prompt = base_prompt
            for attempt in range(3):
                report, used_model = call_gemini(prompt, key, model)
                issues = validate_report(report, sources)
                if not issues:
                    reviewed = {**report, "source_metadata": [{k: s.get(k) for k in
                                ("id", "publisher", "title", "period_label")} for s in sources]}
                    review, _ = call_gemini(build_review_prompt(reviewed), key, model)
                    issues = validate_review(review, report)
                if not issues:
                    break
                prompt = base_prompt + "\n[직전 응답]\n" + json.dumps(report, ensure_ascii=False)
                prompt += "\n[검사 실패 — 위 원문으로만 수정]\n" + "\n".join(issues)
            if issues:
                raise ValueError(" / ".join(issues))
            result = public_document(report, sources, timestamp, timestamp, failures)
            result["model"] = used_model
            result["semantic_review"] = "PASS"
            notes["result"] = "PASS"
        result["source_fingerprint"] = source_hash
        save(OUTPUT, result)
    except Exception as error:
        notes["result"] = "FAIL"
        notes["error"] = f"{type(error).__name__}: {str(error)[:500]}"
        if isinstance(locals().get("report"), dict):
            notes["rejected_draft"] = report
        if previous.get("version"):
            previous["refresh_status"] = "failed"
            previous["last_attempt_at"] = timestamp
            save(OUTPUT, previous)
        save(NOTES, notes)
        print(json.dumps(notes, ensure_ascii=False))
        raise SystemExit("산업 브리핑 생성 실패: 검증되지 않은 새 내용은 게시하지 않았습니다.")
    save(NOTES, notes)
    print(json.dumps(notes, ensure_ascii=False))


if __name__ == "__main__":
    main()

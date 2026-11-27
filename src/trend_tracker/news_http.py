"""공식 뉴스 통신, 제한된 재시도, 경로별 수집 결과 기록."""

from __future__ import annotations

import atexit
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree.ElementTree import ParseError

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36"
REQUESTS: list[dict] = []
CHANNELS: list[dict] = []
RETRYABLE = {408, 429, 500, 502, 503, 504}

try:
    from curl_cffi import requests as compatible_http
except ImportError:
    compatible_http = None


def _certificate_path():
    """Windows의 한글 경로에서도 공개 CA 인증서를 그대로 검증한다."""
    import certifi
    path = Path(certifi.where())
    if os.name != "nt" or str(path).isascii():
        return str(path)
    relative = os.path.relpath(path)
    if relative.isascii():
        return relative
    target = Path("runtime/news-ca/cacert.pem")
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or target.read_bytes() != path.read_bytes():
        target.write_bytes(path.read_bytes())
    return str(target)


def fetch_bytes(url: str, timeout: int = 20, *, data: bytes | None = None,
                headers: dict | None = None, attempts: int = 3, standard: bool = False) -> bytes:
    if not url.startswith("https://"):
        raise ValueError("공식 뉴스는 HTTPS 주소만 허용합니다")
    request_headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9", **(headers or {})}
    transport = "curl_cffi" if compatible_http is not None and not standard else "urllib"
    record = {"url": url, "transport": transport, "attempts": 0, "status": "failed"}
    REQUESTS.append(record)
    for attempt in range(attempts):
        record["attempts"] = attempt + 1
        try:
            if transport == "curl_cffi":
                response = compatible_http.request("POST" if data is not None else "GET", url,
                    data=data, headers=request_headers, impersonate="chrome", timeout=timeout,
                    verify=_certificate_path(), allow_redirects=True, max_redirects=5)
                code, content = response.status_code, response.content
                if code >= 400:
                    raise HTTPError(url, code, "공식 뉴스 서버 응답 오류", response.headers, None)
            else:
                with urlopen(Request(url, data=data, headers=request_headers), timeout=timeout) as response:
                    code, content = response.status, response.read(4_000_001)
            if not content or len(content) > 4_000_000:
                raise ValueError("공식 뉴스 응답이 비어 있거나 크기 제한을 초과했습니다")
            record.update(status="ok", http_status=code)
            record.pop("error", None)
            return content
        except Exception as error:
            record["error"] = type(error).__name__
            if isinstance(error, HTTPError):
                record["http_status"] = error.code
                retry = error.code in RETRYABLE
                # 공개 서버별 통신 호환성 차이: 같은 HTTPS 주소를 표준
                # 클라이언트로 한 번 확인하며 인증서 검증은 그대로 유지한다.
                if error.code == 403 and transport == "curl_cffi":
                    transport = "urllib"
                    record["transport"] = "curl_cffi_then_urllib"
                    retry = True
            else:
                retry = isinstance(error, (TimeoutError, URLError, OSError)) or (
                    compatible_http is not None and isinstance(error, compatible_http.exceptions.RequestException)
                )
            if not retry or attempt + 1 == attempts:
                raise
            delay = min(2 ** attempt, 4)
            if isinstance(error, HTTPError) and error.headers:
                requested_delay = error.headers.get("Retry-After", "")
                if str(requested_delay).isdigit():
                    if int(requested_delay) > 10:
                        raise
                    delay = max(delay, int(requested_delay))
            time.sleep(delay)
    raise RuntimeError("공식 뉴스 수집 재시도 종료")


def checked_channel(label: str, collect, *, allow_empty: bool = False) -> list:
    record = {"name": label, "status": "failed", "item_count": 0}
    CHANNELS.append(record)
    for attempt in range(2):
        record["attempts"] = attempt + 1
        try:
            rows = list(collect())
            if not rows and not allow_empty:
                raise ValueError("기사 목록이 비어 있습니다. 페이지 형식이나 발표일을 확인해야 합니다")
            record.update(status="ok", item_count=len(rows))
            return rows
        except Exception as error:
            # HTTP 200이어도 간헐적으로 불완전한 페이지를 받는 경우 한 번만 재확인한다.
            if attempt == 0 and isinstance(error, (ValueError, ParseError)):
                time.sleep(0.5)
                continue
            record["error"] = type(error).__name__
            record["message"] = str(error).splitlines()[0][:160]
            if isinstance(error, HTTPError):
                record["http_status"] = error.code
            print(f"수집 경로 지연: {label} ({type(error).__name__}: {str(error)[:160]})")
            return []
    return []


def _save_health():
    target = os.environ.get("NEWS_HEALTH_PATH")
    if target:
        path = Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"channels": CHANNELS, "requests": REQUESTS}, ensure_ascii=False, indent=2), encoding="utf-8")


atexit.register(_save_health)

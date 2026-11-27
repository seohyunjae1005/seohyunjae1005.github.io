"""공식 뉴스 페이지에서 분석용 본문을 추출한다.

본문은 AI 분석의 입력으로만 사용하며 공개 웹 데이터에는 직접 포함하지 않는다.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ALLOWED_HOSTS = {
    "ir.appliedmaterials.com",
    "ir.kla.com",
    "news.samsung.com",
    "news.samsungsemiconductor.com",
    "investor.asml.com",
    "www.investor.asml.com",
    "news.skhynix.com",
    "newsroom.lamresearch.com",
    "pr.tsmc.com",
    "www.asml.com",
    "www.intel.com",
    "www.intc.com",
    "investors.micron.com",
    "investor.appliedmaterials.com",
    "investors.appliedmaterials.com",
    "www.kioxia-holdings.com",
    "www.kioxia.com",
    "www.kla.com",
    "www.micron.com",
    "www.tel.com",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)

STOP_HEADINGS = (
    "about samsung",
    "about asml",
    "about sk hynix",
    "about intel",
    "forward looking statements",
    "forward-looking statements",
    "related articles",
    "related content",
    "press resources",
    "media contact",
)

BOILERPLATE_PHRASES = (
    "manage cookie",
    "all rights reserved",
    "privacy policy",
    "terms of use",
    "customer support",
    "subscribe to",
)

GENERIC_SUMMARY_PHRASES = (
    "official source:",
    "official intel newsroom category:",
    "official applied materials news release",
)


@dataclass(frozen=True)
class ExtractedBody:
    company: str
    title: str
    url: str
    published_at: str | None
    extraction_method: str
    body: str
    character_count: int
    paragraph_count: int
    fetched_at: str

    def to_dict(self) -> dict:
        return asdict(self)


class _ScriptParser(HTMLParser):
    """application/ld+json 스크립트만 모은다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._capturing = False
        self._buffer: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "script":
            return
        values = {key.casefold(): (value or "") for key, value in attrs}
        self._capturing = values.get("type", "").casefold() == "application/ld+json"
        self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capturing:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._capturing:
            self.scripts.append("".join(self._buffer).strip())
            self._capturing = False
            self._buffer = []


class _BlockParser(HTMLParser):
    """메뉴와 스크립트를 제외하고 본문 후보 문단을 모은다."""

    BLOCK_TAGS = {"p", "li", "h2", "h3"}
    SKIP_TAGS = {"script", "style", "nav", "header", "footer", "form", "svg", "noscript", "button"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._tag: str | None = None
        self._depth = 0
        self._buffer: list[str] = []
        self.blocks: list[tuple[str, str]] = []
        self.stopped = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.stopped:
            return
        tag = tag.casefold()
        values = {key.casefold(): (value or "") for key, value in attrs}
        classes = set(values.get("class", "").casefold().split())
        # SK hynix의 관련 기사 카드는 article.item으로 시작한다.
        if tag == "article" and "item" in classes and self.blocks:
            self.stopped = True
            return
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if self._tag is not None:
            self._depth += 1
        elif tag in self.BLOCK_TAGS:
            self._tag = tag
            self._depth = 1
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        if self.stopped:
            return
        tag = tag.casefold()
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth or self._tag is None:
            return
        self._depth -= 1
        if self._depth == 0:
            text = _clean_text(" ".join(self._buffer))
            if text:
                self.blocks.append((self._tag, text))
            self._tag = None
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self.stopped:
            return
        if not self._skip_depth and self._tag is not None:
            self._buffer.append(data)


def _clean_text(value: str) -> str:
    value = unescape(value).replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def _article_body_from_json(value: object) -> str:
    if isinstance(value, dict):
        body = value.get("articleBody")
        if isinstance(body, str) and len(_clean_text(body)) >= 300:
            return _clean_text(body)
        for child in value.values():
            found = _article_body_from_json(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _article_body_from_json(child)
            if found:
                return found
    return ""


def _json_ld_body(html_text: str) -> str:
    parser = _ScriptParser()
    parser.feed(html_text)
    for script in parser.scripts:
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue
        body = _article_body_from_json(payload)
        if body:
            return body
    return ""


def _html_block_body(html_text: str) -> tuple[str, int]:
    parser = _BlockParser()
    parser.feed(html_text)
    selected: list[str] = []
    seen: set[str] = set()
    started = False

    for tag, text in parser.blocks:
        folded = text.casefold()
        if tag in {"h2", "h3"} and (
            folded.startswith("about ")
            or any(marker in folded for marker in STOP_HEADINGS)
        ):
            if started:
                break
            continue
        if any(marker in folded for marker in BOILERPLATE_PHRASES):
            continue
        if text.startswith(("▲", "©")):
            continue

        # 짧은 메뉴·태그는 버리고 설명력이 있는 문장과 본문 제목만 남긴다.
        is_sentence = len(text) >= 80 and text.count(" ") >= 8
        is_body_heading = started and tag in {"h2", "h3"} and 8 <= len(text) <= 180
        if not (is_sentence or is_body_heading):
            continue
        normalized = text.casefold()
        if normalized in seen:
            continue
        seen.add(normalized)
        selected.append(text)
        started = True

    return "\n\n".join(selected), len(selected)


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"허용하지 않은 공식 출처입니다: {url}")


def extract_official_summary(article: dict, minimum_length: int = 180) -> ExtractedBody:
    """본문 접근 실패 시 충분히 긴 공식 RSS 요약만 제한적으로 사용한다."""

    url = str(article.get("url") or "")
    _validate_url(url)
    summary = _clean_text(str(article.get("summary") or ""))
    folded = summary.casefold()
    if (
        len(summary) < minimum_length
        or any(folded.startswith(marker) for marker in GENERIC_SUMMARY_PHRASES)
    ):
        raise RuntimeError("분석에 사용할 수 있는 공식 요약이 없습니다.")

    title = _clean_text(str(article.get("title") or ""))
    body = f"{title}\n\n{summary}" if title else summary
    return ExtractedBody(
        company=str(article.get("company") or "Unknown"),
        title=title,
        url=url,
        published_at=article.get("published_at"),
        extraction_method="official_feed_summary",
        body=body,
        character_count=len(body),
        paragraph_count=2 if title else 1,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def extract_official_index_metadata(article: dict) -> ExtractedBody:
    """본문·요약 접근이 모두 막힌 경우 공식 목록의 최소 정보만 보존한다.

    이 값은 기사 본문을 대신하지 않는다. 분석 단계에서 낮은 확신도로만
    사용하며, 이후 본문이 확보되면 캐시의 결과가 자동 교체된다.
    """

    url = str(article.get("url") or "")
    _validate_url(url)
    title = _clean_text(str(article.get("title") or ""))
    if len(title) < 25:
        raise RuntimeError("분석에 사용할 수 있는 공식 제목 정보가 없습니다.")

    summary = _clean_text(str(article.get("summary") or ""))
    body_parts = [f"Official article title: {title}"]
    if summary:
        body_parts.append(f"Official listing context: {summary}")
    body = "\n\n".join(body_parts)
    return ExtractedBody(
        company=str(article.get("company") or "Unknown"),
        title=title,
        url=url,
        published_at=article.get("published_at"),
        extraction_method="official_index_metadata",
        body=body,
        character_count=len(body),
        paragraph_count=len(body_parts),
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def fetch_article_body(article: dict, timeout: int = 30) -> ExtractedBody:
    url = str(article.get("url") or "")
    _validate_url(url)
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "identity",
            "Connection": "close",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        html_text = response.read().decode("utf-8", errors="replace")

    body = _json_ld_body(html_text)
    method = "json_ld_article_body"
    if not body:
        body, paragraph_count = _html_block_body(html_text)
        method = "filtered_html_blocks"
    else:
        paragraph_count = max(1, body.count(". "))

    if len(body) < 300:
        raise RuntimeError(f"본문이 너무 짧아 분석에 사용하지 않습니다: {len(body)}자")

    return ExtractedBody(
        company=str(article.get("company") or "Unknown"),
        title=str(article.get("title") or ""),
        url=url,
        published_at=article.get("published_at"),
        extraction_method=method,
        body=body,
        character_count=len(body),
        paragraph_count=paragraph_count,
        fetched_at=datetime.now(timezone.utc).isoformat(),
    )

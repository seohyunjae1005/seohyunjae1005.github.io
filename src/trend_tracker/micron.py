"""Micron 공식 기술 블로그 공개 검색 API 수집기."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin
from .news_http import fetch_bytes, checked_channel
from html import unescape

from .rss import Article, DEFAULT_USER_AGENT, unique_by_url


SEARCH_URL = (
    "https://www.micron.com/content/micron/us/en/about/blog/"
    "_jcr_content.search.json/search"
)
TECHNOLOGY_TAG = "micron:document type-categories-subcategories/blog/technology"
PRESS_URL = "https://www.micron.com/about/press/news"


def _parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def fetch_micron_technology(days: int = 180, max_results: int = 100) -> list[Article]:
    """Micron Technology 분류의 최근 게시물을 반환한다."""

    payload = {
        "filters": {"contentType": [TECHNOLOGY_TAG]},
        "locale": "en_US",
        "searchText": "",
        "numOfResult": max_results,
        "startOffset": 0,
        "sortBy": "Date",
    }
    # 현재 공식 검색 화면은 요청 출처 페이지(Referer)를 요구한다.
    data = json.loads(fetch_bytes(SEARCH_URL, timeout=25,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Referer": "https://www.micron.com/about/blog"}))
    docs = data.get("searchResults", {}).get("docs")
    if not isinstance(docs, list) or not docs:
        raise ValueError("Micron 기술 블로그의 공식 검색 결과 형식 변경")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    articles: list[Article] = []
    for row in docs:
        date_value = row.get("modifieddate") or row.get("creationdate")
        title = row.get("title_en") or ""
        url = row.get("pageurl") or ""
        if not date_value or not title or not url:
            continue
        published = _parse_date(date_value)
        if not cutoff <= published <= datetime.now(timezone.utc):
            continue
        articles.append(
            Article(
                source_id="micron",
                company="Micron",
                title=title.strip(),
                url=url,
                published_at=published.isoformat(),
                summary=(row.get("description_en") or "").strip(),
                collected_at=collected_at,
            )
        )
    return unique_by_url(articles)


def _clean(value):
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value)).split())


def parse_press_news(html: str, days: int = 180) -> list[Article]:
    starts = list(re.finditer(r'<div\b[^>]*\bclass="cmp-teaser"', html))
    now = datetime.now(timezone.utc)
    rows = []
    for index, match in enumerate(starts):
        block = html[match.start():starts[index + 1].start() if index + 1 < len(starts) else len(html)]
        title = re.search(r'<h[23][^>]*class="cmp-teaser__title"[^>]*>(.*?)</h[23]>', block, re.S)
        date = re.search(r'<div[^>]*class="cmp-teaser__description"[^>]*>(.*?)</div>', block, re.S)
        link = re.search(r'<a\b[^>]*class="[^"]*cmp-teaser__action-link[^>]*>', block)
        target = re.search(r'href="([^"]+)"', link.group()) if link else None
        if not (title and date and target):
            continue
        try:
            published = datetime.strptime(_clean(date.group(1)), "%B %d, %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if now - timedelta(days=days) <= published <= now:
            rows.append(Article("micron", "Micron", _clean(title.group(1)),
                urljoin(PRESS_URL, unescape(target.group(1))), published.isoformat(),
                "Official Micron press release", now.isoformat()))
    if not rows:
        raise ValueError("Micron 공식 보도자료 목록을 읽지 못했습니다")
    return unique_by_url(rows)


def fetch_micron_news(days: int = 180) -> list[Article]:
    blog = checked_channel("기술 블로그", lambda: fetch_micron_technology(days))
    news = checked_channel("공식 보도자료", lambda: parse_press_news(fetch_bytes(PRESS_URL).decode("utf-8"), days))
    return sorted(unique_by_url([*news, *blog]), key=lambda row: row.published_at or "", reverse=True)

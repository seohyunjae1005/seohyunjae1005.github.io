"""ASML 공식 보도자료와 기술 스토리 수집기."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request
from urllib.parse import urljoin

from .news_http import fetch_bytes, checked_channel
from xml.etree import ElementTree

from .rss import Article, parse_rss, unique_by_url


SITEMAP_URLS = (
    "https://www.asml.com/sitemap-1.xml",
    "https://www.asml.com/sitemap-2.xml",
)
PRESS_RSS_URL = "https://investor.asml.com/rss/news-releases.xml"
PRESS_LIST_URL = "https://investor.asml.com/news/press-releases-and-announcements"
ASML_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
INCLUDED_PATHS = (
    "/en/news/press-releases/",
    "/en/company/stories/",
)
TECH_KEYWORDS = (
    "euv",
    "duv",
    "high na",
    "lithography",
    "semiconductor",
    "manufacturing",
    "metrology",
    "inspection",
    "defect",
    "wafer",
    "scanner",
    "equipment",
    "engineering",
    "innovation",
    "ai",
)


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "meta":
            return
        values = {key: value or "" for key, value in attrs}
        name = (values.get("property") or values.get("name") or "").casefold()
        if name == "og:title" and not self.title:
            self.title = values.get("content", "")
        elif name in {"og:description", "description"} and not self.description:
            self.description = values.get("content", "")


def _request(url: str, timeout: int = 20) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": ASML_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    return fetch_bytes(url, timeout=timeout)


def _sitemap_urls() -> list[str]:
    namespaces = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls: list[str] = []
    for sitemap_url in SITEMAP_URLS:
        root = ElementTree.fromstring(_request(sitemap_url))
        for item in root.findall("sm:url", namespaces):
            url = item.findtext("sm:loc", default="", namespaces=namespaces)
            if any(path in url for path in INCLUDED_PATHS):
                urls.append(url)
    return list(dict.fromkeys(urls))


def _page_data(url: str) -> tuple[str, str, datetime | None]:
    try:
        page = _request(url, timeout=12).decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError):
        raise
    parser = _MetaParser()
    parser.feed(page)
    match = re.search(
        r'"publicationDate"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"', page
    )
    if not match:
        raise ValueError("ASML 기술 스토리 발표일 형식 변경")
    try:
        published = datetime.fromisoformat(match.group(1).replace("Z", "+00:00"))
    except ValueError:
        published = None
    title = unescape(parser.title).removesuffix(" | ASML").strip()
    return title, unescape(parser.description).strip(), published


def _keyword_matches(title: str) -> list[str]:
    text = title.casefold()
    matches: list[str] = []
    for keyword in TECH_KEYWORDS:
        if len(keyword) <= 3 and keyword.isalnum():
            found = re.search(
                rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])",
                text,
            )
        else:
            found = keyword in text
        if found:
            matches.append(keyword)
    return matches


def _technology_stories(
    days: int = 180,
) -> list[tuple[Article, list[str], str, str]]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    collected: list[tuple[Article, list[str], str, str]] = []

    candidate_years = range(cutoff.year, now.year + 1)
    urls = [
        url
        for url in _sitemap_urls()
        if any(f"/{year}/" in url for year in candidate_years)
    ]
    with ThreadPoolExecutor(max_workers=8) as executor:
        page_rows = list(executor.map(_page_data, urls))

    for url, (title, description, published) in zip(urls, page_rows):
        if not title or published is None:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        published = published.astimezone(timezone.utc)
        if not cutoff <= published <= now:
            continue
        content_type = "Technology story" if "/company/stories/" in url else "Press release"
        matches = _keyword_matches(title)
        relevance = "high" if content_type == "Technology story" or matches else "context"
        collected.append(
            (
                Article(
                    source_id="asml",
                    company="ASML",
                    title=title,
                    url=url,
                    published_at=published.isoformat(),
                    summary=description or f"Official ASML {content_type}",
                    collected_at=collected_at,
                ),
                matches,
                content_type,
                relevance,
            )
        )

    unique = unique_by_url(article for article, *_ in collected)
    row_map = {
        article.url: (matches, content_type, relevance)
        for article, matches, content_type, relevance in collected
    }
    return [
        (article, *row_map[article.url])
        for article in sorted(
            unique, key=lambda value: value.published_at or "", reverse=True
        )
    ]


def parse_press_list(html: str) -> list[Article]:
    pattern = re.compile(r'<div[^>]+class="[^"]*search-results__date-posted[^"]*"[^>]*>(.*?)</div>\s*'
        r'<div[^>]+class="[^"]*search-results__title[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
    rows = []
    for date, target, title in pattern.findall(html):
        published = datetime.strptime(re.sub(r"<[^>]+>", "", date).strip(), "%B %d, %Y").replace(tzinfo=timezone.utc)
        rows.append(Article("asml", "ASML", unescape(re.sub(r"<[^>]+>", "", title)).strip(),
            urljoin(PRESS_LIST_URL, unescape(target)), published.isoformat(),
            "Official ASML press release", datetime.now(timezone.utc).isoformat()))
    if not rows:
        raise ValueError("ASML 공식 보도자료 목록 형식 변경")
    return rows


def fetch_asml_news(days: int = 180) -> list[tuple[Article, list[str], str, str]]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    def press_list():
        articles = []
        for page in range(6):
            url = PRESS_LIST_URL + (f"?page={page}" if page else "")
            rows = parse_press_list(_request(url).decode("utf-8", errors="replace"))
            articles.extend(row for row in rows if cutoff <= datetime.fromisoformat(row.published_at) <= now)
            if any(datetime.fromisoformat(row.published_at) < cutoff for row in rows):
                break
        return articles
    releases = checked_channel("공식 보도자료 목록", press_list)
    releases.extend(checked_channel("공식 공시 피드", lambda: parse_rss(_request(PRESS_RSS_URL), "asml", "ASML")))
    rows = [(article, _keyword_matches(article.title), "Press release",
             "high" if _keyword_matches(article.title) else "context") for article in releases
            if article.published_at and cutoff <= datetime.fromisoformat(article.published_at) <= now]
    rows.extend(checked_channel("기술 스토리", lambda: _technology_stories(days)))
    unique = {row[0].url: row for row in rows}
    return sorted(unique.values(), key=lambda row: row[0].published_at or "", reverse=True)

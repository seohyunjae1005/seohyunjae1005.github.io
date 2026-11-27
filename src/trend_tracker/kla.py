"""KLA 공식 보도자료와 KLA Advance 기술 콘텐츠 수집기."""

from __future__ import annotations

import re
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel
from xml.etree import ElementTree

from .rss import Article, parse_rss, unique_by_url


IR_URL = "https://ir.kla.com/news-events/press-releases"
POST_SITEMAP_URL = "https://www.kla.com/post-sitemap.xml"
ADVANCE_URL = "https://www.kla.com/advance"
IR_RSS_URL = "https://ir.kla.com/news-events/press-releases/rss"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TECH_KEYWORDS = (
    "semiconductor",
    "process control",
    "inspection",
    "metrology",
    "defect",
    "yield",
    "wafer",
    "reticle",
    "mask",
    "euv",
    "lithography",
    "overlay",
    "patterning",
    "film",
    "critical dimension",
    "advanced packaging",
    "ic substrate",
    "interposer",
    "plasma dicing",
    "fab",
    "fabrication",
    "logic",
    "dram",
    "nand",
)


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.published = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "meta":
            return
        values = {key: value or "" for key, value in attrs}
        name = (values.get("property") or values.get("name") or "").casefold()
        content = values.get("content", "")
        if name == "og:title" and not self.title:
            self.title = content
        elif name in {"og:description", "description"} and not self.description:
            self.description = content
        elif name == "article:published_time" and not self.published:
            self.published = content


def _request(url: str, timeout: int = 30) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    return fetch_bytes(url, timeout=timeout)


def _clean_html(value: str) -> str:
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value)).split())


def _ir_articles(cutoff: datetime, collected_at: str) -> list[tuple[Article, str]]:
    html = _request(IR_URL).decode("utf-8", errors="replace")
    pattern = re.compile(
        r'<article\s+class="media"[^>]*>.*?'
        r'<time\s+datetime="([^"]+)"[^>]*>.*?</time>.*?'
        r'<h2\s+class="media-heading"[^>]*>\s*'
        r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>',
        flags=re.I | re.S,
    )
    rows: list[tuple[Article, str]] = []
    for date_text, url, raw_title in pattern.findall(html):
        try:
            published = datetime.fromisoformat(date_text.replace("Z", "+00:00"))
        except ValueError:
            continue
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        published = published.astimezone(timezone.utc)
        if published < cutoff:
            continue
        rows.append(
            (
                Article(
                    source_id="kla",
                    company="KLA",
                    title=_clean_html(raw_title),
                    url=unescape(url),
                    published_at=published.isoformat(),
                    summary="Official KLA press release",
                    collected_at=collected_at,
                ),
                "Press release",
            )
        )
    return rows


def _advance_urls(cutoff: datetime) -> list[str]:
    namespaces = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ElementTree.fromstring(_request(POST_SITEMAP_URL))
    urls: list[str] = []
    for item in root.findall("sm:url", namespaces):
        url = item.findtext("sm:loc", default="", namespaces=namespaces)
        modified_text = item.findtext("sm:lastmod", default="", namespaces=namespaces)
        if not url.startswith("https://www.kla.com/advance/"):
            continue
        try:
            modified = datetime.fromisoformat(modified_text.replace("Z", "+00:00"))
        except ValueError:
            continue
        if modified.tzinfo is None:
            modified = modified.replace(tzinfo=timezone.utc)
        if modified.astimezone(timezone.utc) >= cutoff:
            urls.append(url)
    return list(dict.fromkeys(urls))


def _advance_page(url: str) -> tuple[str, str, datetime | None]:
    try:
        html = _request(url, timeout=20).decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError):
        return "", "", None
    parser = _MetaParser()
    parser.feed(html)
    try:
        published = datetime.fromisoformat(parser.published.replace("Z", "+00:00"))
    except ValueError:
        published = None
    if published is not None and published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    return (
        unescape(parser.title).removesuffix(" - KLA").strip(),
        unescape(parser.description).strip(),
        published.astimezone(timezone.utc) if published else None,
    )


def _advance_articles(cutoff: datetime, collected_at: str) -> list[tuple[Article, str]]:
    urls = _advance_urls(cutoff)
    with ThreadPoolExecutor(max_workers=8) as executor:
        page_rows = list(executor.map(_advance_page, urls))
    rows: list[tuple[Article, str]] = []
    for url, (title, description, published) in zip(urls, page_rows):
        if not title or published is None or published < cutoff:
            continue
        category = "Innovation" if "/advance/innovation/" in url else "KLA Advance"
        rows.append(
            (
                Article(
                    source_id="kla",
                    company="KLA",
                    title=title,
                    url=url,
                    published_at=published.isoformat(),
                    summary=description or f"Official KLA {category} article",
                    collected_at=collected_at,
                ),
                category,
            )
        )
    return rows


def _keyword_matches(article: Article) -> list[str]:
    text = f"{article.title} {article.summary}".casefold()
    return [keyword for keyword in TECH_KEYWORDS if keyword in text]


def fetch_kla_news(
    days: int = 180,
) -> list[tuple[Article, list[str], str, str]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    def releases():
        rows = parse_rss(_request(IR_RSS_URL), "kla", "KLA")
        if not rows:
            raise ValueError("KLA 보도자료 피드 형식 변경")
        return [(article, "Press release") for article in rows
                if article.published_at and cutoff <= datetime.fromisoformat(article.published_at) <= datetime.now(timezone.utc)]
    collected = checked_channel("공식 보도자료", releases)
    def advance():
        try:
            return parse_advance_archive(_request(ADVANCE_URL).decode("utf-8", errors="replace"), cutoff, collected_at)
        except ValueError:
            # 일부 CDN 응답은 HTTP 200이어도 다른 페이지 템플릿이다.
            # 같은 공식 주소의 표준 HTTP 응답도 검사한다.
            return parse_advance_archive(fetch_bytes(ADVANCE_URL, standard=True).decode("utf-8", errors="replace"), cutoff, collected_at)
    collected.extend(checked_channel("기술 블로그", advance))
    enriched: list[tuple[Article, list[str], str, str]] = []
    for article, source_category in collected:
        matches = _keyword_matches(article)
        relevance = "high" if source_category == "Innovation" or matches else "context"
        enriched.append((article, matches, source_category, relevance))

    unique = unique_by_url(article for article, *_ in enriched)
    metadata = {
        article.url: (matches, source_category, relevance)
        for article, matches, source_category, relevance in enriched
    }
    return [
        (article, *metadata[article.url])
        for article in sorted(
            unique, key=lambda value: value.published_at or "", reverse=True
        )
    ]


def parse_advance_archive(html: str, cutoff: datetime, collected_at: str) -> list[tuple[Article, str]]:
    match = re.search(r"\bvar\s+advancePosts\s*=\s*", html)
    if not match:
        raise ValueError("KLA 공식 블로그 목록 형식 변경")
    posts, _ = json.JSONDecoder().raw_decode(html[match.end():])
    rows = []
    for post in posts:
        published = datetime.fromisoformat(post["dateIso"])
        if cutoff <= published <= datetime.now(timezone.utc):
            rows.append((Article("kla", "KLA", _clean_html(post["title"]), post["link"],
                published.isoformat(), _clean_html(post.get("excerpt") or ""), collected_at),
                "Innovation" if "/innovation/" in post["link"] else "KLA Advance"))
    return rows

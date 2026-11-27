"""Tokyo Electron 공식 뉴스룸 수집기."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel

from .rss import Article, unique_by_url


NEWS_URL = "https://www.tel.com/news/{year}/index.html"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TECH_KEYWORDS = (
    "semiconductor",
    "wafer",
    "prober",
    "fab",
    "manufacturing",
    "deposition",
    "etch",
    "cleaning",
    "lithography",
    "euv",
    "coater",
    "developer",
    "bonding",
    "advanced packaging",
    "3d integration",
    "3di",
    "process control",
    "yield",
    "uniformity",
    "equipment",
    "device",
)


class _NewsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.href = ""
        self.date = ""
        self.title_parts: list[str] = []
        self.category_parts: list[str] = []
        self.in_title = False
        self.in_category = False
        self.rows: list[tuple[str, str, str, list[str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag == "a" and values.get("href", "").startswith("/news/"):
            self.href = urljoin("https://www.tel.com", values["href"])
            self.date = ""
            self.title_parts = []
            self.category_parts = []
        elif self.href and tag == "time":
            self.date = values.get("datetime", "")
        elif self.href and tag == "p" and "c-news__summary" in values.get("class", ""):
            self.in_title = True
        elif self.href and tag == "em":
            self.in_category = True

    def handle_data(self, data: str) -> None:
        value = " ".join(data.split())
        if not value:
            return
        if self.in_title:
            self.title_parts.append(value)
        elif self.in_category:
            self.category_parts.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "p":
            self.in_title = False
        elif tag == "em":
            self.in_category = False
        elif tag == "a" and self.href:
            title = unescape(" ".join(self.title_parts)).strip()
            if self.date and title:
                categories = list(dict.fromkeys(self.category_parts))
                self.rows.append((self.date, title, self.href, categories))
            self.href = ""
            self.date = ""
            self.title_parts = []
            self.category_parts = []
            self.in_title = False
            self.in_category = False


def _request(year: int, timeout: int = 30) -> str:
    request = Request(
        NEWS_URL.format(year=year),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    return fetch_bytes(request.full_url, timeout=timeout).decode("utf-8", errors="replace")


def _keyword_matches(title: str) -> list[str]:
    text = title.casefold()
    return [keyword for keyword in TECH_KEYWORDS if keyword in text]


def _fetch_tokyo_electron_news(
    days: int = 180,
) -> list[tuple[Article, list[str], list[str], str]]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    collected_at = now.isoformat()
    collected: list[tuple[Article, list[str], list[str], str]] = []

    for year in range(cutoff.year, now.year + 1):
        parser = _NewsParser()
        parser.feed(_request(year))
        for date_text, title, url, categories in parser.rows:
            try:
                published = datetime.strptime(date_text, "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                continue
            if published < cutoff or published > now + timedelta(days=1):
                continue
            article = Article(
                source_id="tokyo_electron",
                company="Tokyo Electron",
                title=title,
                url=url,
                published_at=published.isoformat(),
                summary="Official Tokyo Electron newsroom item",
                collected_at=collected_at,
            )
            matches = _keyword_matches(title)
            product_category = any("Products / Services" in value for value in categories)
            relevance = "high" if matches or product_category else "context"
            collected.append((article, matches, categories, relevance))

    unique = unique_by_url(article for article, *_ in collected)
    metadata = {
        article.url: (matches, categories, relevance)
        for article, matches, categories, relevance in collected
    }
    return [
        (article, *metadata[article.url])
        for article in sorted(
            unique, key=lambda value: value.published_at or "", reverse=True
        )
    ]


def fetch_tokyo_electron_news(days: int = 180) -> list[tuple[Article, list[str], list[str], str]]:
    return checked_channel("공식 연도별 뉴스 목록", lambda: _fetch_tokyo_electron_news(days))

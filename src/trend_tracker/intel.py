"""Intel 공식 Newsroom 최신 발표 수집기."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel

from .rss import Article, parse_rss, unique_by_url


NEWSROOM_URL = "https://www.intel.com/content/www/us/en/newsroom/home.html"
IR_RSS = "https://www.intc.com/news-events/press-releases/rss"
INTEL_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TECH_CATEGORIES = {"intel foundry", "manufacturing", "new technologies"}
TECH_KEYWORDS = (
    "semiconductor",
    "foundry",
    "process technology",
    "manufacturing",
    "fab",
    "wafer",
    "advanced packaging",
    "chiplet",
    "18a",
    "14a",
    "ribbonfet",
    "powervia",
    "emib",
    "foveros",
    "glass substrate",
)


class _IntelNewsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[dict[str, str]] = []
        self._row: dict[str, str] | None = None
        self._div_depth = 0
        self._capture: str | None = None
        self._capture_tag: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        classes = set(values.get("class", "").split())
        if tag == "div" and self._row is None and "cmp-teaser" in classes:
            self._row = {}
            self._div_depth = 1
            return
        if self._row is None:
            return
        if tag == "div":
            self._div_depth += 1
        if tag == "a" and "cmp-teaser__link" in classes:
            self._row["url"] = values.get("href", "")
            self._row["title"] = values.get("aria-label", "")
        elif tag == "p" and "cmp-teaser__pretitle" in classes:
            self._capture, self._capture_tag = "category", tag
        elif tag == "h2" and "cmp-teaser__title" in classes:
            if not self._row.get("title"):
                self._capture, self._capture_tag = "title", tag
        elif tag == "p" and self._div_depth > 1:
            self._capture, self._capture_tag = "possible_date", tag

    def handle_data(self, data: str) -> None:
        if self._row is not None and self._capture and data.strip():
            self._row[self._capture] = (
                self._row.get(self._capture, "") + " " + data.strip()
            ).strip()

    def handle_endtag(self, tag: str) -> None:
        if self._row is None:
            return
        if tag == self._capture_tag:
            self._capture = None
            self._capture_tag = None
        if tag == "div":
            self._div_depth -= 1
            if self._div_depth == 0:
                if self._row.get("title") and self._row.get("url"):
                    self.rows.append(self._row)
                self._row = None


def _parse_date(value: str) -> datetime | None:
    cleaned = " ".join(value.split())
    try:
        return datetime.strptime(re.sub(r",\s*", ", ", cleaned), "%B %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _keyword_matches(title: str) -> list[str]:
    text = title.casefold()
    return [keyword for keyword in TECH_KEYWORDS if keyword in text]


def _newsroom_articles(
    days: int = 180,
) -> list[tuple[Article, list[str], str, str]]:
    request = Request(
        NEWSROOM_URL,
        headers={
            "User-Agent": INTEL_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    page = fetch_bytes(request.full_url, timeout=30).decode("utf-8", errors="replace")

    parser = _IntelNewsParser()
    parser.feed(page)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    collected: list[tuple[Article, list[str], str, str]] = []

    for row in parser.rows:
        url = urljoin(NEWSROOM_URL, row.get("url", ""))
        if "/newsroom/" not in url:
            continue
        published = _parse_date(row.get("possible_date", ""))
        if published is None or published < cutoff:
            continue
        title = row["title"].strip()
        category = row.get("category", "Unknown").strip() or "Unknown"
        matches = _keyword_matches(title)
        category_key = category.casefold()
        relevance = "high" if (
            category_key in TECH_CATEGORIES
            or (matches and category_key != "corporate information")
        ) else "context"
        collected.append(
            (
                Article(
                    source_id="intel",
                    company="Intel",
                    title=title,
                    url=url,
                    published_at=published.isoformat(),
                    summary=f"Official Intel Newsroom category: {category}",
                    collected_at=collected_at,
                ),
                matches,
                category,
                relevance,
            )
        )

    unique = unique_by_url(article for article, *_ in collected)
    row_map = {
        article.url: (matches, category, relevance)
        for article, matches, category, relevance in collected
    }
    return [
        (article, *row_map[article.url])
        for article in sorted(
            unique, key=lambda value: value.published_at or "", reverse=True
        )
    ]


def fetch_intel_news(days: int = 180) -> list[tuple[Article, list[str], str, str]]:
    rows = checked_channel("공식 뉴스룸", lambda: _newsroom_articles(days))
    now = datetime.now(timezone.utc)
    def ir_news():
        articles = parse_rss(fetch_bytes(IR_RSS), "intel", "Intel")
        if not articles:
            raise ValueError("Intel 공식 투자자 뉴스 피드 형식 변경")
        return [(article, _keyword_matches(article.title), "Press release",
                 "high" if _keyword_matches(article.title) else "context") for article in articles
                if article.published_at and now - timedelta(days=days) <= datetime.fromisoformat(article.published_at) <= now]
    rows.extend(checked_channel("공식 투자자 뉴스", ir_news))
    unique = {article.url: (article, matches, category, relevance) for article, matches, category, relevance in rows}
    return sorted(unique.values(), key=lambda row: row[0].published_at or "", reverse=True)

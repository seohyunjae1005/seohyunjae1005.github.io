"""Kioxia 공식 뉴스 목록 수집기."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel

from .rss import Article, DEFAULT_USER_AGENT, unique_by_url


NEWS_URL = "https://www.kioxia.com/en-jp/news.html"


class _KioxiaNewsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.items: list[dict[str, str]] = []
        self.item: dict[str, str] | None = None
        self.capture: str | None = None
        self.parts: list[str] = []

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        return set((dict(attrs).get("class") or "").split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = self._classes(attrs)
        values = dict(attrs)
        if tag == "li" and "box" in classes:
            self.item = {"url": "", "title": "", "date": "", "tags": ""}
        elif self.item and tag == "a" and "cmp-button" in classes and not self.item["url"]:
            self.item["url"] = urljoin(NEWS_URL, values.get("href") or "")
        elif self.item and tag == "span" and "cmp-button__text" in classes:
            self.capture, self.parts = "title", []
        elif self.item and tag == "span" and "date" in classes:
            self.capture, self.parts = "date", []
        elif self.item and tag == "span" and "tag__inr" in classes:
            self.capture, self.parts = "tag", []

    def handle_data(self, data: str) -> None:
        if self.item and self.capture:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if not self.item:
            return
        if tag == "span" and self.capture:
            text = " ".join("".join(self.parts).split())
            if self.capture == "tag":
                self.item["tags"] = ", ".join(filter(None, [self.item["tags"], text]))
            else:
                self.item[self.capture] = text
            self.capture = None
        elif tag == "li":
            if self.item["url"] and self.item["title"] and self.item["date"]:
                self.items.append(self.item)
            self.item = None
            self.capture = None


def parse_kioxia_news(html_text: str, days: int = 180) -> list[Article]:
    parser = _KioxiaNewsParser()
    parser.feed(html_text)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    articles: list[Article] = []

    for item in parser.items:
        try:
            published = datetime.strptime(item["date"], "%B %d, %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if published < cutoff:
            continue
        articles.append(
            Article(
                source_id="kioxia",
                company="Kioxia",
                title=item["title"],
                url=item["url"],
                published_at=published.isoformat(),
                summary=f"Official category: {item['tags']}",
                collected_at=collected_at,
            )
        )
    return unique_by_url(articles)


def fetch_kioxia_news(days: int = 180) -> list[Article]:
    request = Request(NEWS_URL, headers={"User-Agent": DEFAULT_USER_AGENT})
    html_text = fetch_bytes(request.full_url, timeout=30).decode("utf-8", errors="replace")
    return checked_channel("공식 뉴스 목록", lambda: parse_kioxia_news(html_text, days=days))

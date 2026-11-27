"""SK hynix TECH&AI 공개 목록 페이지 파서와 과거 기사 수집기."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel

from .rss import Article, DEFAULT_USER_AGENT, unique_by_url


ARCHIVE_URL = "https://news.skhynix.com/en/category/tech-and-ai/page/{page}/"


@dataclass
class _ArchiveCard:
    url: str = ""
    title: str = ""
    date_text: str = ""
    tags: list[str] | None = None


class _ArchiveParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.cards: list[_ArchiveCard] = []
        self.card: _ArchiveCard | None = None
        self.capture: str | None = None
        self.parts: list[str] = []

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        values = dict(attrs).get("class") or ""
        return set(values.split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = self._classes(attrs)
        values = dict(attrs)
        if tag == "article" and "item" in classes:
            self.card = _ArchiveCard(tags=[])
        elif self.card and tag == "a" and "item-link" in classes:
            self.card.url = values.get("href") or ""
        elif self.card and tag == "div" and "title" in classes:
            self.capture, self.parts = "title", []
        elif self.card and tag == "div" and "date" in classes:
            self.capture, self.parts = "date", []
        elif self.card and tag == "ul" and "tags" in classes:
            self.capture, self.parts = "tags", []
        elif self.card and self.capture == "tags" and tag == "a":
            self.parts = []

    def handle_data(self, data: str) -> None:
        if self.card and self.capture:
            self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if not self.card:
            return
        text = " ".join("".join(self.parts).split())
        if tag == "div" and self.capture == "title":
            self.card.title, self.capture = text, None
        elif tag == "div" and self.capture == "date":
            self.card.date_text, self.capture = text, None
        elif tag == "a" and self.capture == "tags" and text:
            assert self.card.tags is not None
            self.card.tags.append(text)
            self.parts = []
        elif tag == "ul" and self.capture == "tags":
            self.capture = None
        elif tag == "article":
            if self.card.url and self.card.title and self.card.date_text:
                self.cards.append(self.card)
            self.card = None
            self.capture = None


def _published_at(date_text: str) -> datetime:
    parsed = datetime.strptime(date_text, "%B %d, %Y")
    return parsed.replace(tzinfo=timezone.utc)


def parse_archive_page(html_text: str) -> list[Article]:
    parser = _ArchiveParser()
    parser.feed(html_text)
    collected_at = datetime.now(timezone.utc).isoformat()
    return [
        Article(
            source_id="sk_hynix",
            company="SK hynix",
            title=card.title,
            url=card.url,
            published_at=_published_at(card.date_text).isoformat(),
            summary="Tags: " + ", ".join(card.tags or []),
            collected_at=collected_at,
        )
        for card in parser.cards
    ]


def fetch_tech_archive(
    days: int = 180,
    max_pages: int = 20,
    request_interval_seconds: float = 0.5,
) -> list[Article]:
    """최근 days 이내 TECH&AI 기사를 페이지 순서대로 수집한다."""

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected: list[Article] = []

    for page in range(1, max_pages + 1):
        request = Request(
            ARCHIVE_URL.format(page=page),
            headers={"User-Agent": DEFAULT_USER_AGENT},
        )
        html_text = fetch_bytes(request.full_url, timeout=20).decode("utf-8", errors="replace")
        articles = parse_archive_page(html_text)
        if not articles:
            break

        dated = [
            article
            for article in articles
            if article.published_at
            and datetime.fromisoformat(article.published_at) >= cutoff
        ]
        collected.extend(dated)
        if len(dated) < len(articles):
            break
        if page < max_pages:
            time.sleep(request_interval_seconds)

    return unique_by_url(collected)

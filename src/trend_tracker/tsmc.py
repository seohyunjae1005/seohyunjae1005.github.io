"""TSMC 공식 Press Center의 최근 발표 수집기."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel
from xml.etree import ElementTree

from .rss import Article, DEFAULT_USER_AGENT, unique_by_url


SITEMAP_URL = "https://pr.tsmc.com/english/sitemap.xml"
TECH_KEYWORDS = (
    "semiconductor",
    "technology symposium",
    "process technology",
    "manufacturing",
    "fab",
    "wafer",
    "advanced packaging",
    "image sensor",
    "nanosheet",
    "finfet",
    "cowos",
    "soic",
    "3dfabric",
    "a12",
    "a13",
    "a14",
    "a16",
    "n2",
    "n3",
)
CONTEXT_TITLE_PHRASES = (
    "revenue report",
    "reports first quarter eps",
    "reports second quarter eps",
    "reports third quarter eps",
    "reports fourth quarter eps",
    "board of directors",
    "shareholders’ meeting",
    "shareholders' meeting",
    "annual report on form 20-f",
    "to sell",
)


def _keyword_matches(title: str) -> list[str]:
    text = title.casefold()
    return [keyword for keyword in TECH_KEYWORDS if keyword in text]


def _fetch_tsmc_news(
    days: int = 180,
) -> list[tuple[Article, list[str], str, str]]:
    """최근 발표를 빠짐없이 모으고 기술성과 맥락 정보를 구분한다."""

    request = Request(SITEMAP_URL, headers={"User-Agent": DEFAULT_USER_AGENT})
    root = ElementTree.fromstring(fetch_bytes(request.full_url, timeout=30))

    namespaces = {
        "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
        "news": "http://www.google.com/schemas/sitemap-news/0.9",
    }
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    collected: list[tuple[Article, list[str], str, str]] = []

    for item in root.findall("sm:url", namespaces):
        url = item.findtext("sm:loc", default="", namespaces=namespaces)
        title = item.findtext("news:news/news:title", default="", namespaces=namespaces)
        date_value = item.findtext(
            "news:news/news:publication_date", default="", namespaces=namespaces
        )
        if "/english/news/" not in url or not title or not date_value:
            continue
        try:
            published = datetime.fromisoformat(date_value).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if published < cutoff:
            continue

        matches = _keyword_matches(title)
        forced_context = any(
            phrase in title.casefold() for phrase in CONTEXT_TITLE_PHRASES
        )
        category = "Technology" if matches and not forced_context else "Business"
        relevance = "high" if category == "Technology" else "context"
        collected.append(
            (
                Article(
                    source_id="tsmc",
                    company="TSMC",
                    title=title.strip(),
                    url=url,
                    published_at=published.astimezone(timezone.utc).isoformat(),
                    summary="Official source: TSMC Press Center",
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


def fetch_tsmc_news(days: int = 180) -> list[tuple[Article, list[str], str, str]]:
    return checked_channel("공식 뉴스 목록", lambda: _fetch_tsmc_news(days))

"""Applied Materials 공식 보도자료 RSS 수집기."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel

from .rss import Article, fetch_rss, unique_by_url


RSS_URL = "https://ir.appliedmaterials.com/rss/news-releases.xml"
ARCHIVE_URL = "https://ir.appliedmaterials.com/news-releases?page={page}"
CORPORATE_ARCHIVE_URL = "https://www.appliedmaterials.com/us/en/newsroom/press-releases.html"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TECH_KEYWORDS = (
    "semiconductor",
    "chip",
    "wafer",
    "fab",
    "dram",
    "hbm",
    "advanced packaging",
    "deposition",
    "epitaxy",
    "etch",
    "cmp",
    "e-beam",
    "ebeam",
    "metrology",
    "inspection",
    "defect",
    "materials engineering",
    "logic",
    "3d scaling",
    "gate-all-around",
    "angstrom",
    "epic center",
    "manufacturing",
)


class _ArchiveParser(HTMLParser):
    """날짜 다음에 보도자료 링크가 나오는 공식 목록 구조를 읽는다."""

    _date_pattern = re.compile(
        r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) "
        r"\d{1,2}, \d{4}$"
    )

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.current_date = ""
        self.active_url = ""
        self.active_date = ""
        self.active_text: list[str] = []
        self.rows: list[tuple[str, str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        values = {key: value or "" for key, value in attrs}
        href = values.get("href", "")
        if "/news-releases/news-release-details/" in href:
            self.active_url = urljoin("https://ir.appliedmaterials.com", href)
            self.active_date = self.current_date
            self.active_text = []

    def handle_data(self, data: str) -> None:
        value = " ".join(data.split())
        if not value:
            return
        if self.active_url:
            self.active_text.append(value)
        elif self._date_pattern.match(value):
            self.current_date = value

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or not self.active_url:
            return
        title = unescape(" ".join(self.active_text)).strip()
        if title and self.active_date:
            self.rows.append((self.active_date, title, self.active_url))
        self.active_url = ""
        self.active_date = ""
        self.active_text = []


def _fetch_archive_page(page: int, timeout: int = 25) -> list[tuple[str, str, str]]:
    request = Request(
        ARCHIVE_URL.format(page=page),
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    body = fetch_bytes(request.full_url, timeout=timeout).decode("utf-8", errors="replace")
    parser = _ArchiveParser()
    parser.feed(body)
    return parser.rows


def _archive_articles(cutoff: datetime) -> list[Article]:
    collected_at = datetime.now(timezone.utc).isoformat()
    articles: list[Article] = []
    seen_urls: set[str] = set()
    for page in range(6):
        try:
            rows = _fetch_archive_page(page)
        except (HTTPError, URLError, TimeoutError):
            break
        page_added = 0
        page_dates: list[datetime] = []
        for date_text, title, url in rows:
            try:
                published = datetime.strptime(date_text, "%b %d, %Y").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                continue
            page_dates.append(published)
            if published < cutoff or url in seen_urls:
                continue
            seen_urls.add(url)
            page_added += 1
            articles.append(
                Article(
                    source_id="applied_materials",
                    company="Applied Materials",
                    title=title,
                    url=url,
                    published_at=published.isoformat(),
                    summary="Official Applied Materials news release",
                    collected_at=collected_at,
                )
            )
        if not rows or page_added == 0 or (page_dates and min(page_dates) < cutoff):
            break
    return articles


def _published_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _keyword_matches(article: Article) -> list[str]:
    # 보도자료 하단의 상시 회사 소개에는 semiconductor, manufacturing 같은
    # 표현이 반복되므로 제목만 판정해야 안경·재무 기사까지 기술 신호로
    # 잘못 분류되는 일을 막을 수 있다.
    text = article.title.casefold()
    return [keyword for keyword in TECH_KEYWORDS if keyword in text]


def fetch_applied_materials_news(
    days: int = 180,
) -> list[tuple[Article, list[str], str]]:
    """공식 RSS 항목을 수집하고 장비·공정 관련성을 분류한다."""

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rss_articles = checked_channel("공식 보도자료 피드", lambda: fetch_rss(
            RSS_URL,
            source_id="applied_materials",
            company="Applied Materials",
            timeout_seconds=30,
        ))
    archive = checked_channel("공식 보도자료 목록", lambda: parse_corporate_archive(
        fetch_bytes(CORPORATE_ARCHIVE_URL).decode("utf-8", errors="replace"), cutoff))
    articles = unique_by_url([*rss_articles, *archive])
    collected: list[tuple[Article, list[str], str]] = []
    for article in articles:
        published = _published_datetime(article.published_at)
        if published is not None and published < cutoff:
            continue
        matches = _keyword_matches(article)
        relevance = "high" if matches else "context"
        collected.append((article, matches, relevance))

    return sorted(
        collected,
        key=lambda row: row[0].published_at or "",
        reverse=True,
    )


def parse_corporate_archive(html: str, cutoff: datetime) -> list[Article]:
    rows = []
    for block in re.findall(r"<tr\b[^>]*>(.*?)</tr>", html, re.S | re.I):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", block, re.S | re.I)
        if len(cells) < 2:
            continue
        link = re.search(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', cells[1], re.S)
        try:
            published = datetime.strptime(re.sub(r"<[^>]*>", "", cells[0]).strip(), "%b %d, %Y").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if link and cutoff <= published <= datetime.now(timezone.utc):
            rows.append(Article("applied_materials", "Applied Materials",
                unescape(re.sub(r"<[^>]*>", "", link.group(2))).strip(),
                urljoin(CORPORATE_ARCHIVE_URL, unescape(link.group(1))), published.isoformat(),
                "Official Applied Materials press release", datetime.now(timezone.utc).isoformat()))
    if not rows:
        raise ValueError("Applied Materials 공식 보도자료 목록 형식 변경")
    return rows

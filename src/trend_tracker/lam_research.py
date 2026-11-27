"""Lam Research 공식 보도자료 수집기."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import quote, urljoin

from .rss import Article, unique_by_url


NEWS_URL = "https://newsroom.lamresearch.com/press-releases?l=100"
API_URL = "https://newsroom.lamresearch.com/bin/lamresearch/cision/releases?page={page}&size=100"
BLOG_URL = "https://newsroom.lamresearch.com/blog/?cat=industry"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
TECH_KEYWORDS = (
    "semiconductor",
    "wafer",
    "fab",
    "fabrication",
    "etch",
    "deposition",
    "cleaning",
    "dry resist",
    "photoresist",
    "euv",
    "high na",
    "logic",
    "sub-1nm",
    "gate-all-around",
    "gaa",
    "nand",
    "dram",
    "hbm",
    "advanced packaging",
    "panel-level",
    "chiplet",
    "metrology",
    "process",
    "materials",
    "yield",
)


def _clean_html(value: str) -> str:
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value)).split())


def _request(url: str = NEWS_URL, timeout: int = 30) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def _parse_news(html: str) -> list[tuple[str, str, str, str]]:
    rows: list[tuple[str, str, str, str]] = []
    blocks = re.findall(
        r'<li\s+class="wd_item"[^>]*>(.*?)</li>', html, flags=re.I | re.S
    )
    for block in blocks:
        title_match = re.search(
            r'<div\s+class="wd_title"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>'
            r"(.*?)</a>",
            block,
            flags=re.I | re.S,
        )
        date_match = re.search(
            r'<div\s+class="wd_date"[^>]*>(.*?)</div>', block, flags=re.I | re.S
        )
        summary_match = re.search(
            r'<div\s+class="wd_summary"[^>]*>(.*?)</div>',
            block,
            flags=re.I | re.S,
        )
        if not title_match or not date_match:
            continue
        rows.append(
            (
                _clean_html(date_match.group(1)),
                _clean_html(title_match.group(2)),
                unescape(title_match.group(1)),
                _clean_html(summary_match.group(1)) if summary_match else "",
            )
        )
    return rows


def _keyword_matches(article: Article) -> list[str]:
    text = f"{article.title} {article.summary}".casefold()
    return [keyword for keyword in TECH_KEYWORDS
            if re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", text)]


def _api_rows(payload: dict) -> list[tuple[str, str, str, str]]:
    if payload.get("success") is not True or not isinstance(payload.get("releases"), list):
        raise ValueError("Lam 공식 뉴스 API 응답 형식 변경")
    rows = []
    for row in payload["releases"]:
        if not all(row.get(key) for key in ("title", "date", "releaseId")):
            raise ValueError("Lam 공식 뉴스 필수 정보 누락")
        url = row.get("titleLink") or (
            "/newsroom/press-release-details/?releaseId=" + quote(row["releaseId"], safe="")
        )
        rows.append((row["date"], _clean_html(row["title"]),
                     urljoin(NEWS_URL, url), _clean_html(row.get("summary") or "")))
    return rows


class _BlogParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if tag == "div" and "allBlogs" in classes:
            self.current = values
        if tag == "a" and "additional-resources__card-title" in classes and self.current:
            date, title = self.current.get("data-created-date"), self.current.get("data-header")
            if date and title and values.get("href"):
                self.rows.append((date, title, urljoin(BLOG_URL, values["href"]), "Official Lam Research technology blog"))
            self.current = None


def fetch_lam_research_news(
    days: int = 180,
) -> list[tuple[Article, list[str], str]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    collected_at = datetime.now(timezone.utc).isoformat()
    collected: list[tuple[Article, list[str], str]] = []
    rows = []
    for page in range(1, 6):
        payload = json.loads(_request(API_URL.format(page=page)))
        page_rows = _api_rows(payload)
        if not page_rows:
            if page == 1:
                raise ValueError("Lam 공식 뉴스가 0건: 정상 갱신으로 처리하지 않습니다")
            break
        rows.extend(page_rows)
        oldest = min(datetime.fromisoformat(row[0]).replace(tzinfo=timezone.utc) for row in page_rows)
        if oldest < cutoff or page >= int(payload.get("totalPages", page)):
            break
    blog = _BlogParser()
    blog.feed(_request(BLOG_URL))
    if not blog.rows:
        raise ValueError("Lam 기술 블로그 구조를 확인할 수 없습니다")
    rows.extend(blog.rows)
    for date_text, title, url, summary in rows:
        try:
            published = datetime.fromisoformat(date_text).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if not cutoff <= published <= datetime.now(timezone.utc):
            continue
        article = Article(
            source_id="lam_research",
            company="Lam Research",
            title=title,
            url=url,
            published_at=published.isoformat(),
            summary=summary or "Official Lam Research press release",
            collected_at=collected_at,
        )
        matches = _keyword_matches(article)
        collected.append((article, matches, "high" if matches else "context"))

    unique = unique_by_url(article for article, *_ in collected)
    metadata = {
        article.url: (matches, relevance)
        for article, matches, relevance in collected
    }
    return [
        (article, *metadata[article.url])
        for article in sorted(
            unique, key=lambda value: value.published_at or "", reverse=True
        )
    ]

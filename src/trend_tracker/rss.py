"""표준 라이브러리만 사용하는 최소 RSS 수집기."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Iterable
from urllib.request import Request

from .news_http import fetch_bytes, checked_channel
from xml.etree import ElementTree


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; SemiconductorTrendTracker/0.1; educational project)"
)


@dataclass(frozen=True)
class Article:
    source_id: str
    company: str
    title: str
    url: str
    published_at: str | None
    summary: str
    collected_at: str

    def to_dict(self) -> dict[str, str | None]:
        return asdict(self)


# 제품 이름만으로 다른 사업부 기사가 섞이지 않도록 반도체 산업에서
# 의미가 비교적 분명한 용어를 우선 사용한다. 목록은 향후 회사별 설정으로 분리한다.
SEMICONDUCTOR_KEYWORDS = (
    "semiconductor",
    "foundry",
    "wafer",
    "hbm",
    "dram",
    "v-nand",
    "v nand",
    "nand flash",
    "ddr5",
    "lpddr",
    "gddr",
    "cxl",
    "chiplet",
    "advanced packaging",
    "gate-all-around",
    "gate all around",
    "gaa",
    "process node",
    "exynos",
    "isocell",
    "ai memory",
    "memory solution",
    "hybrid bonding",
    "back-end process",
    "back end process",
    "mass production",
    "semiconductor fab",
    "semiconductor cluster",
    "flash memory",
    "bics flash",
    "3d flash",
    "solid state drive",
    "enterprise ssd",
    "nvme ssd",
    "ufs 5.0",
    "sample shipments",
    "production capacity",
    "memory products",
    "memory industry",
    "flash storage",
    "ssd",
    "ai inference",
    "ai infrastructure",
    "ai ecosystem",
)


def semiconductor_keyword_matches(article: Article) -> list[str]:
    """기사 제목과 요약에서 반도체 관련 근거 키워드를 반환한다."""

    searchable = f"{article.title} {article.summary}".casefold()
    return [keyword for keyword in SEMICONDUCTOR_KEYWORDS if keyword in searchable]


def filter_semiconductor_articles(
    articles: Iterable[Article],
) -> list[tuple[Article, list[str]]]:
    """근거 키워드가 하나 이상인 기사만 선택한다."""

    selected: list[tuple[Article, list[str]]] = []
    for article in articles:
        matches = semiconductor_keyword_matches(article)
        if matches:
            selected.append((article, matches))
    return selected


def _text(element: ElementTree.Element | None) -> str:
    if element is None or element.text is None:
        return ""
    return element.text.strip()


def _normalize_date(value: str) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def parse_rss(xml_bytes: bytes, source_id: str, company: str) -> list[Article]:
    """RSS 2.0 XML에서 공통 기사 필드를 추출한다."""

    root = ElementTree.fromstring(xml_bytes)
    collected_at = datetime.now(timezone.utc).isoformat()
    articles: list[Article] = []

    for item in root.findall("./channel/item"):
        title = _text(item.find("title"))
        url = _text(item.find("link"))
        if not title or not url:
            continue
        articles.append(
            Article(
                source_id=source_id,
                company=company,
                title=title,
                url=url,
                published_at=_normalize_date(_text(item.find("pubDate"))),
                summary=_text(item.find("description")),
                collected_at=collected_at,
            )
        )
    return articles


def fetch_rss(
    url: str,
    source_id: str,
    company: str,
    timeout_seconds: int = 20,
) -> list[Article]:
    """공식 RSS URL을 요청하고 기사 목록을 반환한다."""

    request = Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    xml_bytes = fetch_bytes(url, timeout=timeout_seconds)
    return parse_rss(xml_bytes, source_id=source_id, company=company)


def unique_by_url(articles: Iterable[Article]) -> list[Article]:
    """같은 실행 안에서 URL이 중복되는 기사를 제거한다."""

    seen: set[str] = set()
    result: list[Article] = []
    for article in articles:
        if article.url in seen:
            continue
        seen.add(article.url)
        result.append(article)
    return result

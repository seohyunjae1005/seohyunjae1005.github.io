"""동일 발표의 공식 사이트 복제본과 날짜가 다른 정기 발표를 구분한다."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
import unicodedata


def title_key(row):
    return row.get("company"), " ".join(unicodedata.normalize("NFKC", row.get("title") or "").casefold().split())


def same_story(left, right):
    if title_key(left) != title_key(right):
        return False
    if left.get("url") == right.get("url"):
        return True
    try:
        a, b = [datetime.fromisoformat(str(row["published_at"]).replace("Z", "+00:00")) for row in (left, right)]
        a = a.replace(tzinfo=timezone.utc) if a.tzinfo is None else a
        b = b.replace(tzinfo=timezone.utc) if b.tzinfo is None else b
    except (KeyError, TypeError, ValueError):
        return False
    # 같은 날의 복제본, 또는 공식 뉴스룸·IR 간의 시차/게시 시점 차이만 합친다.
    return (str(left["published_at"])[:10] == str(right["published_at"])[:10]
            or (urlparse(left["url"]).hostname != urlparse(right["url"]).hostname and abs(a - b) <= timedelta(days=2)))

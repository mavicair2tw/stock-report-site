#!/usr/bin/env python3
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from xml.etree import ElementTree as ET
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

TZ = ZoneInfo("Asia/Taipei")

QUERIES = [
    "science breakthrough",
    "technology innovation",
    "space exploration",
    "ai research",
    "health technology",
]


def fetch_google_news_rss(query: str):
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=20) as resp:
        text = resp.read().decode("utf-8", errors="ignore")
    root = ET.fromstring(text)

    items = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        desc = (item.findtext("description") or "").strip()
        if title and link:
            items.append({"title": title, "url": link, "description": desc})
    return items


def clean_text(s: str) -> str:
    t = (s or "").replace("&nbsp;", " ")
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    return " ".join(t.split())


def clip(s: str, n: int = 300) -> str:
    s = clean_text(s)
    return s if len(s) <= n else s[:n] + "…"


def normalize_and_dedupe(items):
    out = []
    seen = set()
    for x in items:
        title = clean_text(x.get("title", ""))
        url = (x.get("url") or "").strip()
        desc = clip(x.get("description", ""), 300)
        if not title or not url:
            continue
        key = (title.lower(), url)
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "titleEn": title,
                "titleZh": title,
                "summaryEn": desc or title,
                "summaryZh": desc or title,
                "url": url,
            }
        )
    return out


def main():
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    all_items = []
    errors = []

    for q in QUERIES:
        try:
            all_items.extend(fetch_google_news_rss(q))
        except Exception as e:
            errors.append(f"{q}: {e}")

    stories = normalize_and_dedupe(all_items)[:10]

    # keep previous stories if sources are temporarily unavailable
    base = Path(__file__).resolve().parent.parent
    out_file = base / "data" / "interesting_stories.json"
    if not stories and out_file.exists():
        old = json.loads(out_file.read_text(encoding="utf-8"))
        stories = old.get("stories", [])[:10]

    out = {
        "updatedAt": now,
        "timezone": "Asia/Taipei",
        "stories": stories,
        "ok": len(stories) > 0,
        "errors": errors or None,
    }

    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {out_file}")


if __name__ == "__main__":
    main()

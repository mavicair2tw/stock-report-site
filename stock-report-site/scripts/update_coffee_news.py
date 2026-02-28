#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from xml.etree import ElementTree as ET
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

TZ = ZoneInfo("Asia/Taipei")

QUERIES = [
    "coffee industry",
    "coffee prices",
    "arabica futures",
    "specialty coffee",
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
        if title and link:
            items.append({"title": title, "url": link})
    return items


def normalize_and_dedupe(items):
    out = []
    seen = set()
    for x in items:
        title = " ".join(x["title"].split())
        url = x["url"].strip()
        if not title or not url:
            continue
        key = (title.lower(), url)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "title": title,
            "titleZh": title,  # keep simple/no machine-translation dependency
            "note": "Source: Google News aggregation",
            "url": url,
        })
    return out


def summarize(news):
    if not news:
        return "今日咖啡新聞暫時無法更新，請稍後再試。"
    top = news[:3]
    points = "；".join([f"{i+1}. {n['title']}" for i, n in enumerate(top)])
    return f"今日咖啡新聞重點：{points}。"


def main():
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    all_items = []
    errors = []

    for q in QUERIES:
        try:
            all_items.extend(fetch_google_news_rss(q))
        except Exception as e:
            errors.append(f"{q}: {e}")

    news = normalize_and_dedupe(all_items)[:10]
    out = {
        "updatedAt": now,
        "timezone": "Asia/Taipei",
        "summary": summarize(news),
        "news": news,
        "ok": len(news) > 0,
        "errors": errors or None,
    }

    base = Path(__file__).resolve().parent.parent
    out_file = base / "data" / "coffee_news.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {out_file}")


if __name__ == "__main__":
    main()

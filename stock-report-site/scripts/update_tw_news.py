#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

TZ = ZoneInfo("Asia/Taipei")
URL = "https://news.cnyes.com/news/cat/tw_stock_news"


def fetch_headlines():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
    resp = requests.get(URL, headers=headers, timeout=20)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    headlines = []
    for a in soup.select("a"):
        text = " ".join(a.get_text(strip=True).split())
        href = a.get("href") or ""
        if not text or len(text) < 8:
            continue
        if not href:
            continue
        if href.startswith("/"):
            href = "https://www.cnyes.com" + href
        if "news" in href or "topic" in href or "twstock" in href:
            headlines.append({"title": text, "url": href})

    seen = set()
    uniq = []
    for h in headlines:
        key = (h["title"], h["url"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(h)

    return uniq[:12]


def summarize(headlines):
    if not headlines:
        return "目前無法抓取鉅亨網台股頁面內容，建議稍後再試。"

    top = headlines[:5]
    joined = "；".join([f"{i+1}. {x['title']}" for i, x in enumerate(top)])
    return f"今日台股新聞重點：{joined}。建議優先關注權值股、ETF 資金流向與政策面消息。"


def main():
    now = datetime.now(tz=TZ).isoformat()
    try:
        headlines = fetch_headlines()
        summary = summarize(headlines)
        ok = True
        error = None
    except Exception as e:
        headlines = []
        summary = "目前新聞來源連線異常，請稍後再試。"
        ok = False
        error = str(e)

    out = {
        "updatedAt": now,
        "timezone": "Asia/Taipei",
        "source": URL,
        "ok": ok,
        "summary": summary,
        "headlines": headlines,
        "error": error,
    }

    base = Path(__file__).resolve().parent.parent
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_file = data_dir / "tw_news.json"
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {out_file}")


if __name__ == "__main__":
    main()

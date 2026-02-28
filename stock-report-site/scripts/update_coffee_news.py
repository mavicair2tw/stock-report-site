#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from xml.etree import ElementTree as ET
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

TZ = ZoneInfo("Asia/Taipei")

QUERIES_ZH = [
    "咖啡 產業",
    "咖啡 豆 價格",
    "咖啡 市場",
    "精品咖啡",
    "咖啡 連鎖",
]

QUERIES_EN = [
    "coffee industry",
    "coffee prices",
    "arabica futures",
    "specialty coffee",
    "coffee chain",
]


def fetch_google_news_rss(query: str, hl: str, gl: str, ceid: str):
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={ceid}"
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


def normalize_and_dedupe(items, lang):
    out = []
    seen = set()
    for x in items:
        title = " ".join((x.get("title") or "").split())
        url = (x.get("url") or "").strip()
        if not title or not url:
            continue
        key = (title.lower(), url)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "title": title,
            "titleZh": title if lang == "zh" else "",
            "titleEn": title if lang == "en" else "",
            "note": "Source: Google News aggregation",
            "url": url,
            "lang": lang,
        })
    return out


def summarize(zh_news, en_news):
    if not zh_news and not en_news:
        return "今日咖啡新聞暫時無法更新，請稍後再試。"
    z = "；".join([f"{i+1}. {n['title']}" for i, n in enumerate(zh_news[:2])]) if zh_news else "（中文暫無）"
    e = "；".join([f"{i+1}. {n['title']}" for i, n in enumerate(en_news[:2])]) if en_news else "（English unavailable）"
    return f"今日咖啡新聞重點｜中文：{z}｜English: {e}"


def main():
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    zh_items, en_items = [], []
    errors = []

    for q in QUERIES_ZH:
        try:
            zh_items.extend(fetch_google_news_rss(q, "zh-TW", "TW", "TW:zh-Hant"))
        except Exception as e:
            errors.append(f"zh:{q}: {e}")

    for q in QUERIES_EN:
        try:
            en_items.extend(fetch_google_news_rss(q, "en-US", "US", "US:en"))
        except Exception as e:
            errors.append(f"en:{q}: {e}")

    news_zh = normalize_and_dedupe(zh_items, "zh")[:5]
    news_en = normalize_and_dedupe(en_items, "en")[:5]

    out = {
        "updatedAt": now,
        "timezone": "Asia/Taipei",
        "summary": summarize(news_zh, news_en),
        "newsZh": news_zh,
        "newsEn": news_en,
        "news": news_zh + news_en,
        "ok": len(news_zh) + len(news_en) > 0,
        "errors": errors or None,
    }

    base = Path(__file__).resolve().parent.parent
    out_file = base / "data" / "coffee_news.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {out_file}: zh={len(news_zh)} en={len(news_en)}")


if __name__ == "__main__":
    main()

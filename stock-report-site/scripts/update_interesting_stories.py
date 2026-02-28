#!/usr/bin/env python3
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Taipei")

QUERIES_ZH = [
    "日常生活 有趣故事",
    "食衣住行 趨勢",
    "教育 新知",
    "科學 發現",
    "哲學 思辨",
    "自然 生態",
    "旅遊 文化",
    "休閒 娛樂",
]

QUERIES_EN = [
    "daily life interesting stories",
    "food fashion housing transport trends",
    "education insights",
    "science discoveries",
    "philosophy ideas",
    "nature and ecology",
    "travel and culture",
    "leisure and entertainment",
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


def normalize_and_dedupe(items, lang: str):
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
        if lang == "zh":
            out.append(
                {
                    "lang": "zh",
                    "titleZh": title,
                    "titleEn": "",
                    "summaryZh": desc or title,
                    "summaryEn": "",
                    "url": url,
                }
            )
        else:
            out.append(
                {
                    "lang": "en",
                    "titleZh": "",
                    "titleEn": title,
                    "summaryZh": "",
                    "summaryEn": desc or title,
                    "url": url,
                }
            )
    return out


def load_old(out_file: Path):
    if not out_file.exists():
        return {}, [], []
    old = json.loads(out_file.read_text(encoding="utf-8"))
    return old, old.get("storiesZh", []), old.get("storiesEn", [])


def main():
    now = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    errors = []

    zh_raw = []
    en_raw = []

    for q in QUERIES_ZH:
        try:
            zh_raw.extend(fetch_google_news_rss(q, "zh-TW", "TW", "TW:zh-Hant"))
        except Exception as e:
            errors.append(f"zh:{q}: {e}")

    for q in QUERIES_EN:
        try:
            en_raw.extend(fetch_google_news_rss(q, "en-US", "US", "US:en"))
        except Exception as e:
            errors.append(f"en:{q}: {e}")

    stories_zh = normalize_and_dedupe(zh_raw, "zh")[:5]
    stories_en = normalize_and_dedupe(en_raw, "en")[:5]

    base = Path(__file__).resolve().parent.parent
    out_file = base / "data" / "interesting_stories.json"
    old, old_zh, old_en = load_old(out_file)

    if not stories_zh:
        stories_zh = old_zh[:5]
    if not stories_en:
        stories_en = old_en[:5]

    stories = stories_zh + stories_en

    out = {
        "updatedAt": now,
        "timezone": "Asia/Taipei",
        "storiesZh": stories_zh,
        "storiesEn": stories_en,
        "stories": stories,
        "ok": len(stories) > 0,
        "errors": errors or None,
    }

    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {out_file}: zh={len(stories_zh)} en={len(stories_en)}")


if __name__ == "__main__":
    main()

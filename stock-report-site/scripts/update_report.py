#!/usr/bin/env python3
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import yfinance as yf

TZ = ZoneInfo("Asia/Taipei")

ASSETS = [
    {"label": "TSM", "symbol": "TSM", "type": "Stock"},
    {"label": "GOOG", "symbol": "GOOG", "type": "Stock"},
    {"label": "AMD", "symbol": "AMD", "type": "Stock"},
    {"label": "NVDA", "symbol": "NVDA", "type": "Stock"},
    {"label": "BTC", "symbol": "BTC-USD", "type": "Crypto"},
    {"label": "Tesla", "symbol": "TSLA", "type": "Stock"},
    {"label": "Gold", "symbol": "GC=F", "type": "Commodity"},
    {"label": "S&P 500", "symbol": "^GSPC", "type": "Index"},
    {"label": "NASDAQ SOX", "symbol": "^SOX", "type": "Index"},
]


def fmt(value, digits=2):
    if value is None:
        return None
    return round(float(value), digits)


def fetch_quote(symbol: str):
    t = yf.Ticker(symbol)
    hist = t.history(period="5d", interval="1d", auto_adjust=False)

    if hist.empty:
        return {
            "price": None,
            "change": None,
            "changePercent": None,
            "currency": None,
        }

    closes = hist["Close"].dropna().tolist()
    latest = closes[-1] if closes else None
    previous = closes[-2] if len(closes) >= 2 else None

    change = (latest - previous) if (latest is not None and previous is not None) else None
    change_pct = ((change / previous) * 100) if (change is not None and previous not in (None, 0)) else None

    info = {}
    try:
        info = t.fast_info or {}
    except Exception:
        pass

    currency = info.get("currency") if isinstance(info, dict) else None

    return {
        "price": fmt(latest, 2),
        "change": fmt(change, 2),
        "changePercent": fmt(change_pct, 2),
        "currency": currency,
    }


def build_report():
    now = datetime.now(tz=TZ)
    items = []

    for asset in ASSETS:
        quote = fetch_quote(asset["symbol"])
        items.append(
            {
                "label": asset["label"],
                "symbol": asset["symbol"],
                "type": asset["type"],
                **quote,
            }
        )

    return {
        "updatedAt": now.isoformat(),
        "timezone": "Asia/Taipei",
        "items": items,
    }


def main():
    report = build_report()

    with open("data/latest.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("Updated data/latest.json")


if __name__ == "__main__":
    main()

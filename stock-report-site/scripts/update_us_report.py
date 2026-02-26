#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yfinance as yf

TZ = ZoneInfo("Asia/Taipei")

ASSETS = [
    {"label": "台積電ADR", "symbol": "TSM", "type": "Stock"},
    {"label": "Google", "symbol": "GOOG", "type": "Stock"},
    {"label": "AMD", "symbol": "AMD", "type": "Stock"},
    {"label": "NVIDIA", "symbol": "NVDA", "type": "Stock"},
    {"label": "Tesla", "symbol": "TSLA", "type": "Stock"},
    {"label": "S&P 500", "symbol": "^GSPC", "type": "Index"},
    {"label": "美國費城半導體指數", "symbol": "^SOX", "type": "Index"},
]


def fmt(v, d=2):
    if v is None:
        return None
    return round(float(v), d)


def fetch_quote(symbol: str):
    t = yf.Ticker(symbol)
    intraday = t.history(period="1d", interval="15m", auto_adjust=False)
    latest = None
    if not intraday.empty and "Close" in intraday:
        c = intraday["Close"].dropna()
        if not c.empty:
            latest = c.iloc[-1]

    daily = t.history(period="5d", interval="1d", auto_adjust=False)
    prev = None
    if not daily.empty and "Close" in daily:
        dc = daily["Close"].dropna()
        if len(dc) >= 2:
            prev = dc.iloc[-2]
        elif len(dc) == 1:
            prev = dc.iloc[-1]

    ch = (latest - prev) if (latest is not None and prev is not None) else None
    chp = ((ch / prev) * 100) if (ch is not None and prev not in (None, 0)) else None

    trend = []
    if not intraday.empty and "Close" in intraday:
        for idx, val in intraday["Close"].dropna().tail(24).items():
            trend.append({
                "time": idx.tz_convert(TZ).strftime("%H:%M") if getattr(idx, "tzinfo", None) else idx.strftime("%H:%M"),
                "close": fmt(val, 2),
            })

    return {
        "price": fmt(latest, 2),
        "change": fmt(ch, 2),
        "changePercent": fmt(chp, 2),
        "trend": trend,
    }


def main():
    now = datetime.now(tz=TZ)
    items = []
    for a in ASSETS:
        items.append({"label": a["label"], "symbol": a["symbol"], "type": a["type"], **fetch_quote(a["symbol"])})

    out = {
        "updatedAt": now.isoformat(),
        "timezone": "Asia/Taipei",
        "market": "US",
        "items": items,
    }

    base = Path(__file__).resolve().parent.parent
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    f = data_dir / "us_latest.json"
    f.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {f}")


if __name__ == "__main__":
    main()

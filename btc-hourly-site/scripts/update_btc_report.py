#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yfinance as yf

TZ = ZoneInfo("Asia/Taipei")


def fmt(v, d=2):
    if v is None:
        return None
    return round(float(v), d)


def build_report():
    now = datetime.now(tz=TZ)
    t = yf.Ticker("BTC-USD")

    hourly = t.history(period="7d", interval="1h", auto_adjust=False)
    closes = hourly["Close"].dropna() if not hourly.empty and "Close" in hourly else []

    latest = closes.iloc[-1] if len(closes) else None
    prev = closes.iloc[-2] if len(closes) >= 2 else None

    change = (latest - prev) if (latest is not None and prev is not None) else None
    change_pct = ((change / prev) * 100) if (change is not None and prev not in (None, 0)) else None

    # last 24 hourly performance rows
    perf24 = []
    if len(closes):
        tail = closes.tail(24)
        last_val = None
        for idx, val in tail.items():
            ch = (val - last_val) if last_val is not None else None
            chp = ((ch / last_val) * 100) if (ch is not None and last_val not in (None, 0)) else None
            perf24.append(
                {
                    "time": idx.tz_convert(TZ).strftime("%m-%d %H:%M") if getattr(idx, "tzinfo", None) else idx.strftime("%m-%d %H:%M"),
                    "price": fmt(val, 2),
                    "change": fmt(ch, 2),
                    "changePercent": fmt(chp, 3),
                }
            )
            last_val = val

    trend = []
    if len(closes):
        for idx, val in closes.tail(72).items():
            trend.append(
                {
                    "time": idx.tz_convert(TZ).strftime("%m-%d %H:%M") if getattr(idx, "tzinfo", None) else idx.strftime("%m-%d %H:%M"),
                    "close": fmt(val, 2),
                }
            )

    return {
        "updatedAt": now.isoformat(),
        "timezone": "Asia/Taipei",
        "asset": "BTC-USD",
        "latest": {
            "price": fmt(latest, 2),
            "change": fmt(change, 2),
            "changePercent": fmt(change_pct, 3),
        },
        "trend72h": trend,
        "performance24h": perf24,
    }


def main():
    report = build_report()

    base_dir = Path(__file__).resolve().parent.parent
    data_dir = base_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_file = data_dir / "latest.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"Updated {out_file}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path
from typing import Dict
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

TZ = ZoneInfo("Asia/Taipei")


def fmt(value, digits=2):
    if value is None:
        return None
    return round(float(value), digits)


def normalize_ts(idx) -> datetime:
    ts = pd.Timestamp(idx)
    if ts.tzinfo is not None:
        return ts.tz_convert(TZ)
    return ts.tz_localize(TZ)


def close_series(frame: pd.DataFrame) -> pd.Series:
    if frame is None or frame.empty or "Close" not in frame:
        return pd.Series(dtype=float)
    return frame["Close"].dropna()


def build_frame(series: pd.Series, *, label: str, interval: str, time_format: str, trend_points: int, table_points: int) -> Dict:
    if series is None or len(series) < 2:
        return None

    latest_val = series.iloc[-1]
    prev_val = series.iloc[-2]
    change = latest_val - prev_val if prev_val is not None else None
    change_pct = ((change / prev_val) * 100) if (change is not None and prev_val not in (None, 0)) else None

    trend = []
    for idx, val in series.tail(trend_points).items():
        ts = normalize_ts(idx)
        trend.append({"time": ts.strftime(time_format), "close": fmt(val, 2)})

    rows = []
    tail = series.tail(table_points + 1)
    prev = None
    for idx, val in tail.items():
        if prev is None:
            prev = val
            continue
        ts = normalize_ts(idx)
        delta = val - prev
        pct = (delta / prev) * 100 if prev else None
        rows.append(
            {
                "label": ts.strftime(time_format),
                "price": fmt(val, 2),
                "change": fmt(delta, 2),
                "changePercent": fmt(pct, 3),
            }
        )
        prev = val

    return {
        "label": label,
        "interval": interval,
        "latest": {
            "price": fmt(latest_val, 2),
            "change": fmt(change, 2),
            "changePercent": fmt(change_pct, 3),
        },
        "series": trend,
        "table": rows,
    }


def build_yearly_frame(monthly_series: pd.Series) -> pd.Series:
    if monthly_series is None or monthly_series.empty:
        return pd.Series(dtype=float)
    year_map: Dict[int, float] = {}
    ts_map: Dict[int, datetime] = {}
    for idx, val in monthly_series.items():
        ts = normalize_ts(idx)
        year_map[ts.year] = val
        ts_map[ts.year] = ts
    years = sorted(year_map.keys())
    values = [year_map[y] for y in years]
    indices = [ts_map[y] for y in years]
    return pd.Series(values, index=pd.Index(indices))


def build_report():
    now = datetime.now(tz=TZ)
    ticker = yf.Ticker("BTC-USD")

    hourly_series = close_series(ticker.history(period="14d", interval="1h", auto_adjust=False))
    daily_series = close_series(ticker.history(period="360d", interval="1d", auto_adjust=False))
    weekly_series = close_series(ticker.history(period="5y", interval="1wk", auto_adjust=False))
    monthly_series = close_series(ticker.history(period="10y", interval="1mo", auto_adjust=False))
    yearly_series = build_yearly_frame(monthly_series)

    frames = {}
    frame_defs = {
        "hour": {
            "series": hourly_series,
            "label": "每小時",
            "interval": "1h",
            "time_format": "%m-%d %H:%M",
            "trend_points": 96,
            "table_points": 24,
        },
        "day": {
            "series": daily_series,
            "label": "每日",
            "interval": "1d",
            "time_format": "%Y-%m-%d",
            "trend_points": 120,
            "table_points": 30,
        },
        "week": {
            "series": weekly_series,
            "label": "每週",
            "interval": "1wk",
            "time_format": "%Y-%m-%d",
            "trend_points": 104,
            "table_points": 26,
        },
        "month": {
            "series": monthly_series,
            "label": "每月",
            "interval": "1mo",
            "time_format": "%Y-%m",
            "trend_points": 120,
            "table_points": 24,
        },
        "year": {
            "series": yearly_series,
            "label": "每年",
            "interval": "1yr",
            "time_format": "%Y",
            "trend_points": 20,
            "table_points": 10,
        },
    }

    for key, cfg in frame_defs.items():
        frame = build_frame(
            cfg["series"],
            label=cfg["label"],
            interval=cfg["interval"],
            time_format=cfg["time_format"],
            trend_points=cfg["trend_points"],
            table_points=cfg["table_points"],
        )
        if frame:
            frames[key] = frame

    default_frame = "day" if "day" in frames else next(iter(frames.keys()), None)

    return {
        "updatedAt": now.isoformat(),
        "timezone": "Asia/Taipei",
        "asset": "BTC-USD",
        "defaultFrame": default_frame,
        "source": {
            "name": "Yahoo Finance",
            "provider": "yfinance",
            "url": "https://finance.yahoo.com/",
        },
        "frames": frames,
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

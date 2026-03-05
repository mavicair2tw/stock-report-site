#!/usr/bin/env python3
import json
from datetime import datetime, time
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TZ = ZoneInfo("Asia/Taipei")
TWSE_BASE = "https://openapi.twse.com.tw/v1"
INDEX_NAME = "發行量加權股價指數"
DEFAULT_HEADERS = {
    "User-Agent": "stock-report-updater/1.0 (+https://openai-tw.com/)",
    "Accept": "application/json",
}

ASSETS = [
    {"label": "加權指數", "symbol": "^TWII", "type": "Index", "category": "index"},
    {"label": "台積電", "symbol": "2330.TW", "type": "Stock"},
    {"label": "富邦科技", "symbol": "0052.TW", "type": "ETF"},
    {"label": "元大台灣50", "symbol": "0050.TW", "type": "ETF"},
    {"label": "凱基台灣TOP50", "symbol": "009816.TW", "type": "ETF"},
    {"label": "群益台灣精選高息", "symbol": "00919.TW", "type": "ETF"},
    {"label": "國泰數位支付服務", "symbol": "00909.TW", "type": "ETF"},
]


def normalize_code(symbol: str) -> str:
    return symbol.replace(".TW", "").replace(".TWO", "")


def parse_decimal(value) -> Decimal | None:
    if value in (None, "", "-", "+"):
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    cleaned = value.replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def fmt(dec: Decimal | None, digits: int = 2) -> float | None:
    if dec is None:
        return None
    quant = Decimal(10) ** -digits
    return float(dec.quantize(quant))


def roc_to_iso(date_str: str) -> str | None:
    if not date_str or len(date_str) != 7:
        return None
    try:
        roc_year = int(date_str[:3])
        year = roc_year + 1911
        month = int(date_str[3:5])
        day = int(date_str[5:7])
        return datetime(year, month, day, tzinfo=TZ).date().isoformat()
    except ValueError:
        return None


def is_trading_window(now: datetime) -> bool:
    if now.weekday() >= 5:  # Sat/Sun
        return False
    market_open = time(9, 0)
    market_close = time(13, 30)
    return market_open <= now.time() <= market_close


def fetch_json(path: str) -> list[dict]:
    url = f"{TWSE_BASE}{path}"
    response = requests.get(url, headers=DEFAULT_HEADERS, timeout=30, verify=False)
    response.raise_for_status()
    return response.json()


def fetch_stock_dataset() -> tuple[dict[str, dict], str | None]:
    data = fetch_json("/exchangeReport/STOCK_DAY_ALL")
    stock_map = {entry["Code"]: entry for entry in data if "Code" in entry}
    data_date = None
    if data:
        data_date = roc_to_iso(data[0].get("Date"))
    return stock_map, data_date


def fetch_index_entry() -> tuple[dict | None, str | None]:
    data = fetch_json("/exchangeReport/MI_INDEX")
    for entry in data:
        if entry.get("指數") == INDEX_NAME:
            return entry, roc_to_iso(entry.get("日期"))
    return None, None


def build_index_quote(entry: dict, data_date: str | None) -> dict:
    price = fmt(parse_decimal(entry.get("收盤指數")))
    sign_token = entry.get("漲跌") or ""
    magnitude = parse_decimal(entry.get("漲跌點數"))
    change = None
    if magnitude is not None:
        sign = -1 if sign_token.strip() == "-" else 1
        change = fmt(magnitude * sign)
    change_percent = fmt(parse_decimal(entry.get("漲跌百分比")))

    trend = []
    if price is not None and data_date:
        trend.append({"time": data_date, "close": price})

    return {
        "price": price,
        "change": change,
        "changePercent": change_percent,
        "currency": "TWD",
        "trend": trend,
    }


def build_stock_quote(entry: dict | None, data_date: str | None) -> dict:
    if not entry:
        return {"price": None, "change": None, "changePercent": None, "currency": "TWD", "trend": []}

    price_dec = parse_decimal(entry.get("ClosingPrice"))
    change_dec = parse_decimal(entry.get("Change"))
    price = fmt(price_dec)
    change = fmt(change_dec)

    change_percent = None
    if price_dec is not None and change_dec is not None:
        prev_close = price_dec - change_dec
        if prev_close != 0:
            change_percent = fmt((change_dec / prev_close) * 100)

    trend = []
    if price is not None and data_date:
        trend.append({"time": data_date, "close": price})

    return {
        "price": price,
        "change": change,
        "changePercent": change_percent,
        "currency": "TWD",
        "trend": trend,
    }


def build_report(now: datetime):
    stock_map, stock_date = fetch_stock_dataset()
    index_entry, index_date = fetch_index_entry()
    data_date = stock_date or index_date

    items = []
    for asset in ASSETS:
        if asset.get("category") == "index":
            quote = build_index_quote(index_entry, data_date)
        else:
            code = normalize_code(asset["symbol"])
            quote = build_stock_quote(stock_map.get(code), data_date)

        items.append({
            "label": asset["label"],
            "symbol": asset["symbol"],
            "type": asset["type"],
            **quote,
        })

    return {
        "updatedAt": now.isoformat(),
        "timezone": "Asia/Taipei",
        "dataDate": data_date,
        "source": {
            "name": "臺灣證券交易所 OpenAPI",
            "provider": "TWSE",
            "url": "https://openapi.twse.com.tw/"
        },
        "market": {
            "name": "TWSE",
            "open": "09:00",
            "close": "13:30",
            "isTradingWindow": is_trading_window(now),
        },
        "items": items,
    }


def main():
    now = datetime.now(tz=TZ)
    report = build_report(now)

    base_dir = Path(__file__).resolve().parent.parent
    data_dir = base_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_file = data_dir / "latest.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"Updated {out_file} at {now.isoformat()}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Send a concise US market brief to LINE."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = BASE_DIR / "data" / "us_latest.json"
UPDATE_SCRIPT = BASE_DIR / "scripts" / "update_us_report.py"
LINE_SCRIPT = BASE_DIR / "scripts" / "notify_line.py"
TAIPEI_TZ = ZoneInfo("Asia/Taipei")

SYMBOLS = {
    "sp500": "^GSPC",
    "sox": "^SOX",
    "tsm": "TSM",
    "nvda": "NVDA",
    "amd": "AMD",
    "tsla": "TSLA",
    "goog": "GOOG",
    "btc": "BTC-USD",
    "gold": "GC=F"
}


def load_payload() -> dict[str, Any]:
    with DATA_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def find_item(payload: dict[str, Any], symbol: str) -> dict[str, Any]:
    for item in payload.get("items", []):
        if item.get("symbol") == symbol:
            return item
    raise KeyError(f"Symbol {symbol} not found in us_latest.json")


def format_index_line(label: str, item: dict[str, Any]) -> str:
    return f"{label}：{item['price']:.0f}（{item['change']:+.0f} / {item.get('changePercent', 0.0):+.2f}%）"


def format_stock_line(label: str, item: dict[str, Any]) -> str:
    return f"{label}：{item['price']:.2f}（{item.get('changePercent', 0.0):+.2f}%）"



def format_combo_line(goog: dict[str, Any], btc: dict[str, Any], gold: dict[str, Any]) -> str:
    return (
        "GOOG / BTC / GOLD："
        f"{goog['price']:.2f}（{goog.get('changePercent', 0.0):+.2f}%） / "
        f"{btc['price']:.0f}（{btc.get('changePercent', 0.0):+.2f}%） / "
        f"{gold['price']:.2f}（{gold.get('changePercent', 0.0):+.2f}%）"
    )


def build_summary(sp_item: dict[str, Any]) -> str:
    pct = sp_item.get("changePercent", 0.0)
    if pct >= 0.8:
        text = "AI 與大型科技股領漲帶動反彈，風險偏好回升；短線偏多但勿追高。"
    elif pct <= -0.8:
        text = "受美債利率與宏觀數據拖累，美股拉回；建議降低部位、等待止穩。"
    else:
        text = "盤勢震盪整理，焦點在財報與數據；建議選股不重槓桿。"
    return f"💡 簡評：{text}"


def is_stale(updated_at: datetime, now: datetime) -> bool:
    return (now - updated_at) > timedelta(hours=18)


def main() -> None:
    parser = argparse.ArgumentParser(description="Send US brief to LINE")
    parser.add_argument("--dry-run", action="store_true", help="Print message without sending")
    parser.add_argument("--skip-update", action="store_true", help="Do not refresh data before sending")
    args = parser.parse_args()

    if not args.skip_update and UPDATE_SCRIPT.exists():
        subprocess.run([sys.executable, str(UPDATE_SCRIPT)], check=True)

    payload = load_payload()
    updated_at = datetime.fromisoformat(payload.get("updatedAt"))
    now = datetime.now(TAIPEI_TZ)
    if is_stale(updated_at, now):
        print("US data stale or holiday; skipping send_us_brief.")
        return

    sp_item = find_item(payload, SYMBOLS["sp500"])
    sox_item = find_item(payload, SYMBOLS["sox"])
    tsm_item = find_item(payload, SYMBOLS["tsm"])
    nvda_item = find_item(payload, SYMBOLS["nvda"])
    amd_item = find_item(payload, SYMBOLS["amd"])
    tsla_item = find_item(payload, SYMBOLS["tsla"])
    goog_item = find_item(payload, SYMBOLS["goog"])
    btc_item = find_item(payload, SYMBOLS["btc"])
    gold_item = find_item(payload, SYMBOLS["gold"])

    date_str = now.strftime("%Y/%m/%d")
    lines = [
        f"【美股快報 {date_str}】",
        f"📊 {format_index_line('S&P500', sp_item)}",
        f"📊 {format_index_line('費半指數', sox_item)}",
        format_stock_line('TSM', tsm_item),
        format_stock_line('NVDA', nvda_item),
        format_stock_line('AMD', amd_item),
        format_stock_line('TESLA', tsla_item),
        format_combo_line(goog_item, btc_item, gold_item),
        build_summary(sp_item)
    ]

    message = "\n".join(lines)
    print(message)

    if args.dry_run:
        return

    subprocess.run([sys.executable, str(LINE_SCRIPT), message], check=True)


if __name__ == "__main__":
    main()

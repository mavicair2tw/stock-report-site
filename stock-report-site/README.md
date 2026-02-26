# Daily US Stock Report Website

This site updates every day at **06:00 Asia/Taipei** and covers:

- TSM
- GOOG
- AMD
- NVDA
- BTC
- Tesla (TSLA)
- Gold (GC=F)
- S&P 500 (^GSPC)
- NASDAQ SOX (^SOX)

## 1) Install dependencies (virtualenv)

```bash
cd /Users/mavicair2tw/.openclaw/workspace/stock-report-site
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Test a manual update

```bash
source .venv/bin/activate
python scripts/update_report.py
cat data/latest.json
```

## 3) View website locally

```bash
cd /Users/mavicair2tw/.openclaw/workspace/stock-report-site
python3 -m http.server 8080
```

Then open:

- http://127.0.0.1:8080/public/

## 4) Enable daily 06:00 auto update (macOS launchd)

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/mavicair2tw/.openclaw/workspace/stock-report-site/com.william.stockreport.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.william.stockreport.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.william.stockreport.plist
launchctl start com.william.stockreport
```

Check status/logs:

```bash
launchctl list | grep stockreport
cat /Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/stockreport.out.log
cat /Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/stockreport.err.log
```

## 5) Optional: deploy publicly (GitHub Pages / Cloudflare / Vercel)

### Option A: GitHub Pages

1. Push this folder to a GitHub repo.
2. In repo settings, enable **Pages** and deploy from branch root (or your preferred static setup).
3. Serve `public/index.html` and `data/latest.json` as static files.

### Option B: Cloudflare Pages / Vercel

- Framework preset: **None / Static site**
- Output directory: repo root (or configure to include `public/` + `data/`)

> Note: static hosting only serves files; it does not run Python jobs by itself.
> Use GitHub Actions (`.github/workflows/daily-update.yml`) to refresh `data/latest.json` daily and push updates.

## Notes

- Data source: Yahoo Finance via `yfinance`.
- The report uses the latest daily close and compares with previous close.
- If markets are closed, values may remain unchanged until next session.

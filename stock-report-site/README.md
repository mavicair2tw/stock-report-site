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

## 5) Deploy publicly (always available, no local terminal needed)

### Option A: GitHub Pages (recommended)

This repo already includes workflow:

- `.github/workflows/stock-report-pages.yml`

It runs daily at **06:00 Asia/Taipei**, regenerates `latest.json`, and deploys to Pages.

Steps:

1. Create a GitHub repo and push this workspace.
2. In GitHub repo settings:
   - **Pages** → Source: **GitHub Actions**
3. Trigger workflow once manually (Actions tab → run workflow).
4. Your site URL will be:
   - `https://<your-github-username>.github.io/<repo-name>/` (project pages)

### Option B: Cloudflare Pages

1. Connect the same GitHub repo to Cloudflare Pages.
2. Build command: *(empty)*
3. Output directory: `dist` (if using Pages workflow artifact route) or `stock-report-site/public` for static-only publish.
4. Keep GitHub Actions as the scheduler to refresh data daily.

> Note: static hosts do not run Python by themselves. The scheduled GitHub Action handles the daily data refresh.

## Notes

- Data source: Yahoo Finance via `yfinance`.
- The report uses the latest daily close and compares with previous close.
- If markets are closed, values may remain unchanged until next session.

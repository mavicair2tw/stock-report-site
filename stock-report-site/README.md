# Taiwan Stock Report Website (15-min updates)

This site tracks these Taiwan market items:

- 加權指數 (`^TWII`)
- 台積電 (`2330.TW`)
- 富邦科技 (`0052.TW`)
- 元大台灣50 (`0050.TW`)
- 凱基台灣TOP50 (`009816.TW`)
- 群益台灣精選高息 (`00919.TW`)
- 國泰數位支付服務 (`00909.TW`)

## Update schedule

- Every **15 minutes**
- During **09:00–13:30 Asia/Taipei**
- Weekdays only (Mon–Fri)

## 1) Install dependencies

```bash
cd /Users/mavicair2tw/.openclaw/workspace/stock-report-site
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Run manual data update

```bash
source .venv/bin/activate
python scripts/update_report.py
cat data/latest.json
```

## 3) Preview website locally

```bash
cd /Users/mavicair2tw/.openclaw/workspace/stock-report-site
python3 -m http.server 8080
```

Open: `http://127.0.0.1:8080/public/`

## 4) Enable macOS auto updates (launchd)

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/mavicair2tw/.openclaw/workspace/stock-report-site/com.william.stockreport.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.william.stockreport.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.william.stockreport.plist
launchctl start com.william.stockreport
```

Check logs:

```bash
cat /Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/stockreport.out.log
cat /Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/stockreport.err.log
```

## 5) Optional: GitHub Pages deployment

Workflow file: `.github/workflows/stock-report-pages.yml`

It now runs every 15 minutes during Taiwan market window (UTC cron).

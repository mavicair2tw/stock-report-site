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

## 6) Daily 台股 email (13:31 Asia/Taipei)

1. Configure credentials once (adjust `PROJECT_DIR` if you keep the repo elsewhere):
   ```bash
   PROJECT_DIR=/Users/mavicair2tw/.openclaw/workspace/stock-report-site-repo/stock-report-site
   cd "$PROJECT_DIR"
   cp .env.example .env
   # edit .env with real GMAIL_USER / GMAIL_APP_PASSWORD / MAIL_TO_DEFAULT / MAIL_FROM_NAME
   ```
2. Test locally:
   ```bash
   source "$PROJECT_DIR"/.venv/bin/activate
   python scripts/send_daily_email.py --dry-run   # preview in terminal
   python scripts/send_daily_email.py            # actually send
   ```
3. Load the launchd job that fires every weekday at 13:31 (Asia/Taipei):
   ```bash
   mkdir -p ~/Library/LaunchAgents
   cp "$PROJECT_DIR"/com.william.stockreport.email.plist ~/Library/LaunchAgents/
   launchctl unload ~/Library/LaunchAgents/com.william.stockreport.email.plist 2>/dev/null || true
   launchctl load ~/Library/LaunchAgents/com.william.stockreport.email.plist
   ```
4. Logs for this job live at:
   - `/Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/email.out.log`
   - `/Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/email.err.log`

`scripts/send_daily_email.py` will render `data/latest.json` into both HTML + plain text and send it through Gmail using STARTTLS. Override the recipient or credentials at runtime with `--to/--gmail-user/--gmail-app-password` if needed.

## 7) Daily 美股 email (05:00 Asia/Taipei)

1. Reuse the same `.env` credentials created above.
2. Test the US report:
   ```bash
   source "$PROJECT_DIR"/.venv/bin/activate
   python scripts/send_us_email.py --dry-run   # preview
   python scripts/send_us_email.py            # send for real
   ```
3. Load the weekday 05:00 launchd job:
   ```bash
   mkdir -p ~/Library/LaunchAgents
   cp "$PROJECT_DIR"/com.william.usstock.email.plist ~/Library/LaunchAgents/
   launchctl unload ~/Library/LaunchAgents/com.william.usstock.email.plist 2>/dev/null || true
   launchctl load ~/Library/LaunchAgents/com.william.usstock.email.plist
   ```
4. Logs live next to the TW job:
   - `/Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/us-email.out.log`
   - `/Users/mavicair2tw/.openclaw/workspace/stock-report-site/logs/us-email.err.log`

`scripts/send_us_email.py` pulls `data/us_latest.json`, builds the same summary/suggestion block, and emails the HTML + text report via Gmail.

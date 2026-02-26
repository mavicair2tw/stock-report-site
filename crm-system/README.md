# CRM Web System (Salesforce-like MVP)

功能包含：

- 註冊 / 登入管理
- 客戶基本資料（客戶ID、地址、電話、Line、Email、登入密碼）
- 公司基本資料（公司ID、地址、電話、Line、Email、統編、登入密碼）
- 案件追蹤（狀態、時間、問題敘述、客戶ID）
- 案件活動（處理人員、狀態、時間、備註）
- 報表與報表管理（狀態分佈、處理人員排行、每日案件量）

## 啟動（開發模式）

```bash
cd /Users/mavicair2tw/.openclaw/workspace/crm-system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

開啟：
- http://127.0.0.1:5050
- 區網：`http://<你的IP>:5050`

## 啟動（正式模式，Gunicorn）

```bash
cd /Users/mavicair2tw/.openclaw/workspace/crm-system
source .venv/bin/activate
pip install -r requirements.txt
export CRM_ENV=production
export CRM_SECRET='請改成你自己的強密碼字串'
gunicorn -c gunicorn.conf.py wsgi:app
```

### 開機自動啟動（macOS launchd）

1. 建立檔案 `~/Library/LaunchAgents/local.crm-system.plist`
2. 內容如下（把 `YOUR_USER` 換成你的 macOS 帳號）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.crm-system</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/YOUR_USER/.openclaw/workspace/crm-system && source .venv/bin/activate && export CRM_ENV=production && export CRM_SECRET='change-this-secret' && gunicorn -c gunicorn.conf.py wsgi:app</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/crm-system.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/crm-system.err.log</string>
</dict>
</plist>
```

3. 載入服務：

```bash
launchctl unload ~/Library/LaunchAgents/local.crm-system.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/local.crm-system.plist
launchctl start local.crm-system
```

## 第一次使用

1. 進入 `/register` 建立管理者帳號
2. 登入後開始建立客戶、公司、案件
3. 點擊案件編號進入詳細頁新增活動

## 備註

- 目前為 SQLite 單機版 MVP
- 客戶/公司登入密碼欄位已改為雜湊存放（畫面僅顯示遮罩）
- 已加入基礎 CSRF 防護、登入/註冊速率限制、輸入格式驗證
- 若要上線建議：
  - RBAC 權限（admin/sales/support）
  - API + 前後端分離
  - 稽核軌跡與通知流程
  - 匯出 Excel / 權限報表

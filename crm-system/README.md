# CRM Web System (Salesforce-like MVP)

功能包含：

- 註冊 / 登入管理
- 客戶基本資料（客戶ID、地址、電話、Line、Email、登入密碼）
- 公司基本資料（公司ID、地址、電話、Line、Email、統編、登入密碼）
- 案件追蹤（狀態、時間、問題敘述、客戶ID）
- 案件活動（處理人員、狀態、時間、備註）
- 報表與報表管理（狀態分佈、處理人員排行、每日案件量）

## 啟動

```bash
cd /Users/mavicair2tw/.openclaw/workspace/crm-system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

開啟：
- http://127.0.0.1:5050

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

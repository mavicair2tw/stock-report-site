import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import Flask, g, redirect, render_template, request, session, url_for, flash
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "crm.db")

app = Flask(__name__)
app.secret_key = os.environ.get("CRM_SECRET", "dev-secret-change-me")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'staff',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            line_id TEXT,
            email TEXT,
            login_password TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            line_id TEXT,
            email TEXT,
            tax_id TEXT,
            login_password TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_no TEXT UNIQUE NOT NULL,
            customer_id TEXT NOT NULL,
            status TEXT NOT NULL,
            issue_desc TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
        );

        CREATE TABLE IF NOT EXISTS ticket_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            assignee TEXT NOT NULL,
            status TEXT NOT NULL,
            activity_time TEXT NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(ticket_id) REFERENCES tickets(id)
        );
        """
    )
    db.commit()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return wrapper


@app.context_processor
def inject_now():
    return {"now": datetime.now()}


@app.route("/init")
def init_route():
    init_db()
    return "DB initialized"


@app.route("/")
def home():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    init_db()
    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]
        role = request.form.get("role", "staff")
        if not username or not password:
            flash("帳號與密碼不可空白")
            return redirect(url_for("register"))

        db = get_db()
        try:
            db.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (username, generate_password_hash(password), role, datetime.now().isoformat()),
            )
            db.commit()
            flash("註冊成功，請登入")
            return redirect(url_for("login"))
        except sqlite3.IntegrityError:
            flash("帳號已存在")
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    init_db()
    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            return redirect(url_for("dashboard"))
        flash("登入失敗，請檢查帳號密碼")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    db = get_db()
    total_tickets = db.execute("SELECT COUNT(*) c FROM tickets").fetchone()["c"]
    open_tickets = db.execute("SELECT COUNT(*) c FROM tickets WHERE status IN ('Open','In Progress')").fetchone()["c"]
    total_customers = db.execute("SELECT COUNT(*) c FROM customers").fetchone()["c"]
    total_companies = db.execute("SELECT COUNT(*) c FROM companies").fetchone()["c"]

    latest_tickets = db.execute("SELECT * FROM tickets ORDER BY updated_at DESC LIMIT 8").fetchall()
    return render_template(
        "dashboard.html",
        total_tickets=total_tickets,
        open_tickets=open_tickets,
        total_customers=total_customers,
        total_companies=total_companies,
        latest_tickets=latest_tickets,
    )


@app.route("/customers", methods=["GET", "POST"])
@login_required
def customers():
    db = get_db()
    if request.method == "POST":
        data = (
            request.form["customer_id"].strip(),
            request.form["name"].strip(),
            request.form.get("address", "").strip(),
            request.form.get("phone", "").strip(),
            request.form.get("line_id", "").strip(),
            request.form.get("email", "").strip(),
            request.form.get("login_password", "").strip(),
            datetime.now().isoformat(),
        )
        try:
            db.execute(
                """
                INSERT INTO customers (customer_id, name, address, phone, line_id, email, login_password, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                data,
            )
            db.commit()
            flash("客戶已新增")
        except sqlite3.IntegrityError:
            flash("客戶ID重複")
        return redirect(url_for("customers"))

    rows = db.execute("SELECT * FROM customers ORDER BY created_at DESC").fetchall()
    return render_template("customers.html", rows=rows)


@app.route("/companies", methods=["GET", "POST"])
@login_required
def companies():
    db = get_db()
    if request.method == "POST":
        data = (
            request.form["company_id"].strip(),
            request.form["name"].strip(),
            request.form.get("address", "").strip(),
            request.form.get("phone", "").strip(),
            request.form.get("line_id", "").strip(),
            request.form.get("email", "").strip(),
            request.form.get("tax_id", "").strip(),
            request.form.get("login_password", "").strip(),
            datetime.now().isoformat(),
        )
        try:
            db.execute(
                """
                INSERT INTO companies (company_id, name, address, phone, line_id, email, tax_id, login_password, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                data,
            )
            db.commit()
            flash("公司已新增")
        except sqlite3.IntegrityError:
            flash("公司ID重複")
        return redirect(url_for("companies"))

    rows = db.execute("SELECT * FROM companies ORDER BY created_at DESC").fetchall()
    return render_template("companies.html", rows=rows)


@app.route("/tickets", methods=["GET", "POST"])
@login_required
def tickets():
    db = get_db()
    if request.method == "POST":
        ticket_no = request.form["ticket_no"].strip()
        customer_id = request.form["customer_id"].strip()
        status = request.form["status"].strip()
        issue_desc = request.form["issue_desc"].strip()
        now = datetime.now().isoformat()
        try:
            db.execute(
                """
                INSERT INTO tickets (ticket_no, customer_id, status, issue_desc, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ticket_no, customer_id, status, issue_desc, now, now),
            )
            db.commit()
            flash("案件已建立")
        except sqlite3.IntegrityError:
            flash("案件編號重複或客戶ID無效")
        return redirect(url_for("tickets"))

    rows = db.execute("SELECT * FROM tickets ORDER BY updated_at DESC").fetchall()
    return render_template("tickets.html", rows=rows)


@app.route("/tickets/<int:ticket_id>", methods=["GET", "POST"])
@login_required
def ticket_detail(ticket_id):
    db = get_db()
    ticket = db.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
    if not ticket:
        flash("找不到案件")
        return redirect(url_for("tickets"))

    if request.method == "POST":
        assignee = request.form["assignee"].strip()
        status = request.form["status"].strip()
        activity_time = request.form["activity_time"].strip() or datetime.now().isoformat(timespec="minutes")
        note = request.form.get("note", "").strip()

        db.execute(
            """
            INSERT INTO ticket_activities (ticket_id, assignee, status, activity_time, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (ticket_id, assignee, status, activity_time, note, datetime.now().isoformat()),
        )
        db.execute(
            "UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?",
            (status, datetime.now().isoformat(), ticket_id),
        )
        db.commit()
        flash("活動已新增")
        return redirect(url_for("ticket_detail", ticket_id=ticket_id))

    activities = db.execute(
        "SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY activity_time DESC", (ticket_id,)
    ).fetchall()
    return render_template("ticket_detail.html", ticket=ticket, activities=activities)


@app.route("/reports")
@login_required
def reports():
    db = get_db()

    status_rows = db.execute(
        "SELECT status, COUNT(*) cnt FROM tickets GROUP BY status ORDER BY cnt DESC"
    ).fetchall()

    assignee_rows = db.execute(
        "SELECT assignee, COUNT(*) cnt FROM ticket_activities GROUP BY assignee ORDER BY cnt DESC LIMIT 10"
    ).fetchall()

    daily_rows = db.execute(
        """
        SELECT substr(created_at, 1, 10) day, COUNT(*) cnt
        FROM tickets
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day DESC
        LIMIT 14
        """
    ).fetchall()

    return render_template("reports.html", status_rows=status_rows, assignee_rows=assignee_rows, daily_rows=daily_rows)


if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(debug=True, port=5050)

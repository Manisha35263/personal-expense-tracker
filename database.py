import sqlite3
from pathlib import Path
from datetime import date, timedelta

DB_PATH = Path(__file__).resolve().parent / "expense_tracker.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('Income', 'Expense')),
                category TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                description TEXT
            )
        """)
        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        if count == 0:
            today = date.today()
            samples = [
                ((today.replace(month=1, day=15)).isoformat(), "Income", "Salary", 5200, "Monthly salary"),
                ((today.replace(month=1, day=20)).isoformat(), "Expense", "Food", 185, "Groceries and dining"),
                ((today.replace(month=2, day=8)).isoformat(), "Expense", "Travel", 240, "Weekend trip"),
                ((today.replace(month=3, day=12)).isoformat(), "Expense", "Bills", 135, "Utilities"),
                ((today.replace(month=4, day=5)).isoformat(), "Expense", "Shopping", 310, "Household items"),
                ((today.replace(month=6, day=18)).isoformat(), "Income", "Freelance", 850, "Design project"),
                ((today.replace(month=8, day=22)).isoformat(), "Expense", "Other", 95, "Miscellaneous"),
                ((today.replace(month=10, day=9)).isoformat(), "Expense", "Food", 160, "Dinner and groceries"),
                ((today.replace(month=11, day=2)).isoformat(), "Expense", "Travel", 420, "Train tickets"),
            ]
            # Keep the sample dates valid for every calendar year.
            conn.executemany("""
                INSERT INTO transactions (date, type, category, amount, description)
                VALUES (?, ?, ?, ?, ?)
            """, samples)


def _dict_rows(rows):
    return [dict(row) for row in rows]


def get_all_transactions():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions ORDER BY date DESC, id DESC"
        ).fetchall()
    return _dict_rows(rows)


def get_transaction(transaction_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM transactions WHERE id = ?", (transaction_id,)
        ).fetchone()
    return dict(row) if row else None


def create_transaction(data):
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO transactions (date, type, category, amount, description)
            VALUES (:date, :type, :category, :amount, :description)
        """, data)
        return cursor.lastrowid


def update_transaction(transaction_id, data):
    with get_connection() as conn:
        conn.execute("""
            UPDATE transactions
            SET date=:date, type=:type, category=:category,
                amount=:amount, description=:description
            WHERE id=:id
        """, {**data, "id": transaction_id})


def delete_transaction(transaction_id):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        return cursor.rowcount > 0


def get_totals():
    with get_connection() as conn:
        row = conn.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN type='Income' THEN amount END), 0) AS income,
                COALESCE(SUM(CASE WHEN type='Expense' THEN amount END), 0) AS expenses
            FROM transactions
        """).fetchone()
    income, expenses = float(row["income"]), float(row["expenses"])
    return {"income": income, "expenses": expenses, "balance": income - expenses}


def get_monthly_expenses():
    # Aggregate by calendar month (Jan-Dec), so the chart always has 12 bars.
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT CAST(strftime('%m', date) AS INTEGER) AS month,
                   SUM(amount) AS total
            FROM transactions
            WHERE type='Expense'
            GROUP BY month
        """).fetchall()
    totals = {int(row["month"]): float(row["total"]) for row in rows}
    return [{"month": month, "total": totals.get(month, 0.0)} for month in range(1, 13)]


def get_category_expenses():
    categories = ["Food", "Travel", "Bills", "Shopping", "Other"]
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT category, SUM(amount) AS total
            FROM transactions
            WHERE type='Expense'
            GROUP BY category
        """).fetchall()
    totals = {row["category"]: float(row["total"]) for row in rows}
    # Include the requested core categories, plus any custom expense categories.
    labels = categories + sorted(set(totals) - set(categories))
    return [{"category": label, "total": totals.get(label, 0.0)} for label in labels if totals.get(label, 0.0) > 0]

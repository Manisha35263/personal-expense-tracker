from datetime import date
import threading
import webbrowser

from flask import Flask, jsonify, render_template, request
from database import (
    init_db, get_all_transactions, get_transaction,
    create_transaction, update_transaction, delete_transaction,
    get_totals, get_monthly_expenses, get_category_expenses,
)

app = Flask(__name__)


def validate_transaction(payload):
    required = ("date", "type", "category", "amount")
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        return None, f"Please provide: {', '.join(missing)}."

    try:
        parsed_date = date.fromisoformat(str(payload["date"]))
    except (TypeError, ValueError):
        return None, "Please enter a valid date."

    tx_type = str(payload["type"]).strip()
    category = str(payload["category"]).strip()
    if tx_type not in ("Income", "Expense"):
        return None, "Type must be Income or Expense."
    if not category:
        return None, "Category is required."

    try:
        amount = float(payload["amount"])
    except (TypeError, ValueError):
        return None, "Amount must be a valid number."
    if amount <= 0:
        return None, "Amount must be greater than zero."

    description = str(payload.get("description", "")).strip()
    if len(description) > 500:
        return None, "Description must be 500 characters or fewer."

    return {
        "date": parsed_date.isoformat(),
        "type": tx_type,
        "category": category,
        "amount": amount,
        "description": description,
    }, None


@app.get("/")
def dashboard():
    return render_template("index.html")


@app.get("/api/transactions")
def list_transactions():
    return jsonify(get_all_transactions())


@app.post("/api/transactions")
def add_transaction():
    data, error = validate_transaction(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    transaction_id = create_transaction(data)
    return jsonify(get_transaction(transaction_id)), 201


@app.put("/api/transactions/<int:transaction_id>")
def edit_transaction(transaction_id):
    if not get_transaction(transaction_id):
        return jsonify({"error": "Transaction not found."}), 404
    data, error = validate_transaction(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), 400
    update_transaction(transaction_id, data)
    return jsonify(get_transaction(transaction_id))


@app.delete("/api/transactions/<int:transaction_id>")
def remove_transaction(transaction_id):
    if not delete_transaction(transaction_id):
        return jsonify({"error": "Transaction not found."}), 404
    return jsonify({"success": True})


@app.get("/api/summary")
def summary():
    return jsonify({
        "totals": get_totals(),
        "monthly": get_monthly_expenses(),
        "categories": get_category_expenses(),
    })


if __name__ == "__main__":
    init_db()
    # Start the browser only in the main process (avoids duplicate tabs).
    threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False)

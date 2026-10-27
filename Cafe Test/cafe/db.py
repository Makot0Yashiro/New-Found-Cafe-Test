import sqlite3
from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  phone TEXT, password_hash TEXT NOT NULL,
  address TEXT, addr_lat REAL, addr_lng REAL, pay_method TEXT DEFAULT 'cash', pay_account TEXT,
  is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, customer_name TEXT,
  order_type TEXT, table_no TEXT, payment TEXT, note TEXT, items_json TEXT,
  subtotal REAL, coupon TEXT, discount REAL, total REAL,
  status TEXT DEFAULT 'Received', status_at TEXT,
  dest_lat REAL, dest_lng REAL, cur_lat REAL, cur_lng REAL,
  created_at TEXT NOT NULL);
"""
UPGRADES = {  # columns added after the first version: upgraded automatically on startup
    "users": [("address", "TEXT"), ("addr_lat", "REAL"), ("addr_lng", "REAL"),
              ("pay_method", "TEXT DEFAULT 'cash'"), ("pay_account", "TEXT"), ("is_admin", "INTEGER DEFAULT 0")],
    "orders": [("status_at", "TEXT")],
}


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    d = g.pop("db", None)
    if d:
        d.close()


def init_app(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        db = get_db()
        db.executescript(SCHEMA)
        for table, cols in UPGRADES.items():
            have = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
            for col, typ in cols:
                if col not in have:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        db.commit()

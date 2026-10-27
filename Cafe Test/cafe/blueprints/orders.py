import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, session, render_template, abort
from ..db import get_db
from ..auth_utils import login_required, check_csrf
from ..menu_data import ITEMS, COUPONS, CAFE_LOCATION

bp = Blueprint("orders", __name__)
TRIP_SECONDS = 120   # how long the courier marker takes to move from the cafe to the customer (demo animation)


def stages(order_type):
    base = ["Received", "Preparing", "Ready"]
    return base + (["Out for delivery", "Delivered"] if order_type == "delivery" else ["Completed"])


def now():
    return datetime.now(timezone.utc)


def locate(row):
    """Where the order is: at the cafe, moving to the customer once 'Out for delivery', then at the customer."""
    lat, lng = CAFE_LOCATION
    if row["order_type"] == "delivery" and row["dest_lat"] is not None:
        if row["status"] == "Delivered":
            return row["dest_lat"], row["dest_lng"]
        if row["status"] == "Out for delivery":
            since = datetime.fromisoformat(row["status_at"] or row["created_at"])
            p = min(max((now() - since).total_seconds() / TRIP_SECONDS, 0), 1)
            return lat + (row["dest_lat"] - lat) * p, lng + (row["dest_lng"] - lng) * p
    return lat, lng


def refresh(row):
    lat, lng = locate(row)
    if row["cur_lat"] != lat or row["cur_lng"] != lng:
        db = get_db()
        db.execute("UPDATE orders SET cur_lat=?, cur_lng=? WHERE id=?", (lat, lng, row["id"]))
        db.commit()
        row = db.execute("SELECT * FROM orders WHERE id=?", (row["id"],)).fetchone()
    return row


def set_status(order_id, status):
    """Used by the admin. Returns the updated row, or None if the status is not valid for that order."""
    db = get_db()
    row = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not row or status not in stages(row["order_type"]) + ["Cancelled"]:
        return None
    db.execute("UPDATE orders SET status=?, status_at=? WHERE id=?", (status, now().isoformat(), order_id))
    db.commit()
    return refresh(db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone())


def public_order(r):
    return {"id": r["id"], "status": r["status"], "order_type": r["order_type"], "table_no": r["table_no"],
            "payment": r["payment"], "total": r["total"], "created_at": r["created_at"], "customer": r["customer_name"],
            "note": r["note"], "items": json.loads(r["items_json"]), "lat": r["cur_lat"], "lng": r["cur_lng"],
            "dest": [r["dest_lat"], r["dest_lng"]] if r["dest_lat"] is not None else None,
            "steps": stages(r["order_type"])}


def _own(order_id):
    r = get_db().execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, session["user_id"])).fetchone()
    return r or abort(404)


@bp.get("/your-order")
@login_required
def your_order():
    rows = get_db().execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", (session["user_id"],)).fetchall()
    return render_template("order.html", orders=[public_order(refresh(r)) for r in rows], cafe=CAFE_LOCATION)


@bp.post("/api/orders")
@login_required
def create_order():
    check_csrf()
    d = request.get_json(silent=True) or {}
    lines, subtotal = [], 0
    for it in d.get("items", []):
        item = ITEMS.get(it.get("id"))
        try:
            qty = int(it.get("qty", 0))
        except (TypeError, ValueError):
            qty = 0
        if not item or not 0 < qty <= 50:
            return jsonify(error="Invalid item"), 400
        lines.append({"id": item["id"], "name": item["name"], "cat": item["cat"], "price": item["price"], "qty": qty})
        subtotal += item["price"] * qty           # price always comes from the server
    if not lines:
        return jsonify(error="Your order is empty"), 400
    otype = d.get("order_type")
    if otype not in ("dine-in", "takeaway", "delivery"):
        return jsonify(error="Choose an order type"), 400
    code = (d.get("coupon") or "").upper()
    discount = round(subtotal * COUPONS.get(code, 0), 2)
    dlat = dlng = None
    if otype == "delivery":
        try:
            dlat, dlng = float(d["dest_lat"]), float(d["dest_lng"])
            assert -90 <= dlat <= 90 and -180 <= dlng <= 180
        except Exception:                         # no location shared -> ~1.5 km from the cafe
            dlat, dlng = CAFE_LOCATION[0] + 0.012, CAFE_LOCATION[1] + 0.010
    db = get_db()
    ts = now().isoformat()
    cur = db.execute(
        "INSERT INTO orders(user_id,customer_name,order_type,table_no,payment,note,items_json,subtotal,coupon,discount,total,"
        "status,status_at,dest_lat,dest_lng,cur_lat,cur_lng,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (session["user_id"], session["user_name"], otype, str(d.get("table_no", ""))[:10], str(d.get("payment", "cash"))[:20],
         str(d.get("note", ""))[:200], json.dumps(lines), subtotal, code if discount else "", discount, subtotal - discount,
         "Received", ts, dlat, dlng, CAFE_LOCATION[0], CAFE_LOCATION[1], ts))
    db.commit()
    return jsonify(id=cur.lastrowid), 201


@bp.get("/api/orders")
@login_required
def list_orders():
    rows = get_db().execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC", (session["user_id"],)).fetchall()
    return jsonify([public_order(refresh(r)) for r in rows])


@bp.get("/api/orders/<int:order_id>/track")
@login_required
def track(order_id):
    return jsonify(public_order(refresh(_own(order_id))))

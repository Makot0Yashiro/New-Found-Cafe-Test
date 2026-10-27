import sqlite3
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash
from ..db import get_db
from ..auth_utils import check_csrf

bp = Blueprint("auth", __name__)


def _safe(nxt):
    return nxt if nxt and nxt.startswith("/") and not nxt.startswith("//") else url_for("account.account")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        check_csrf()
        u = get_db().execute("SELECT * FROM users WHERE email=?", (request.form["email"].strip().lower(),)).fetchone()
        if u and check_password_hash(u["password_hash"], request.form["password"]):
            session.clear()
            session.update(user_id=u["id"], user_name=u["name"], is_admin=bool(u["is_admin"]))
            nxt = request.args.get("next")
            return redirect(_safe(nxt) if nxt or not u["is_admin"] else url_for("admin.dashboard"))
        flash("Wrong email or password.")
    return render_template("auth.html", mode="login")


@bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        check_csrf()
        f = request.form
        if len(f["password"]) < 6:
            flash("Password must be at least 6 characters.")
        else:
            try:
                db = get_db()
                cur = db.execute("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)",
                                 (f["name"].strip(), f["email"].strip().lower(), "",
                                  generate_password_hash(f["password"])))
                db.commit()
                session.clear()
                session.update(user_id=cur.lastrowid, user_name=f["name"].strip())
                return redirect(_safe(request.args.get("next")))
            except sqlite3.IntegrityError:
                flash("That email is already registered.")
    return render_template("auth.html", mode="register")


@bp.post("/logout")
def logout():
    check_csrf()
    session.clear()
    return redirect(url_for("main.home"))

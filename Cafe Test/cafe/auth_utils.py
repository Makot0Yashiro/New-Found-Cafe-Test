import secrets
from functools import wraps
from flask import session, request, redirect, url_for, abort


def login_required(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if "user_id" not in session:
            return redirect(url_for("auth.login", next=request.full_path.rstrip("?")))
        return f(*a, **kw)
    return wrapper


def check_csrf():
    t = request.headers.get("X-CSRFToken") or request.form.get("csrf") or ""
    if not secrets.compare_digest(t, session.get("csrf", "")):
        abort(400, "Bad CSRF token")

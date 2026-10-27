# New Found Cafe — Flask ordering system

## Run it in VS Code
1. Open this folder in VS Code (File → Open Folder → `newfoundcafe`).
2. Open the terminal (Ctrl+`) and create a virtual environment:
   - Windows: `python -m venv .venv` then `.venv\Scripts\activate`
   - Mac/Linux: `python3 -m venv .venv` then `source .venv/bin/activate`
3. Install Flask: `pip install -r requirements.txt`
4. Start the site: `python app.py`
5. Open http://127.0.0.1:5000

Tip: press F5 in VS Code to run it with the debugger (uses `.vscode/launch.json`).
If VS Code asks for an interpreter, choose the one inside `.venv`.

## How access works
- **`/` (Home)** is public — everyone lands here, logged in or not.
- **`/menu`, `/your-order`, `/account`** need a login. If you are not signed in you are sent to the **Login** page,
  and after signing in you are taken straight to the page you clicked.
- **`/login`**, **`/register`** are public. **Logout** is the button in the top bar.

## Pages (blueprints)
| URL | Blueprint file | Template | Login needed |
|---|---|---|---|
| `/` | `cafe/blueprints/main.py` | `home.html` | no |
| `/login`, `/register`, `POST /logout` | `cafe/blueprints/auth.py` | `auth.html` | no |
| `/account` | `cafe/blueprints/account.py` | `account.html` | yes |
| `/menu` | `cafe/blueprints/menu.py` | `menu.html` | yes |
| `/your-order` | `cafe/blueprints/orders.py` | `order.html` | yes |
| `POST /api/orders`, `GET /api/orders` | `cafe/blueprints/orders.py` | — | yes |

All blueprints are registered in **`cafe/blueprints/__init__.py`**.
To protect any page, add `@login_required` (from `cafe/auth_utils.py`) under its route.

## Database
SQLite file **`instance/cafe.db`**, created automatically on first run (schema in `cafe/db.py`).
- `users` — id, name, email (unique), phone, password_hash, created_at
- `orders` — id, user_id, customer_name, order_type, table_no, payment, note, items_json, subtotal, coupon, discount, total, status, created_at

Passwords are never stored in plain text (hashed with Werkzeug/scrypt). To view the data in VS Code, install the
"SQLite Viewer" extension and open `instance/cafe.db`. To reset everything, stop the server and delete the `instance/` folder.

## Where to edit things
- **Menu items, prices, coupons, tables:** `cafe/menu_data.py`
- **Food photos:** put images in `cafe/static/images/` and add `"img": "latte.jpg"` to the item in `menu_data.py`
- **Colors / fonts / layout:** `cafe/static/css/cafe.css`
- **Shared header & layout:** `cafe/templates/base.html`
- **Login / register page:** `cafe/templates/auth.html`
- **Landing page:** `cafe/templates/home.html`
- **Landing-page photo carousel:** photos in the `GALLERY` list in `cafe/blueprints/main.py` (use a URL or a file in `cafe/static/images/`); colours/animation in `cafe/static/css/gallery.css`, behaviour in `cafe/static/js/gallery.js` (Splide is bundled in `cafe/static/vendor/splide/`)

## Security notes
- Forms and the order API use a CSRF token; prices are recalculated on the server.
- A secret key is generated once and stored in `instance/secret_key` (or set the `SECRET_KEY` environment variable).
- Before putting the site online: run it behind HTTPS, set `SESSION_COOKIE_SECURE=True`, turn off debug mode,
  and consider login rate-limiting (e.g. Flask-Limiter).

## Order tracking (new)
- After **Place order** on `/menu` you land on `/your-order?order=ID`. `/your-order` lists all your orders with a live status badge,
  and a **Leaflet / OpenStreetMap** map shows where the order currently is (refreshes every 5 s via `GET /api/orders/<id>/track`).
- Statuses are set by the admin: Received → Preparing → Ready → Out for delivery → Delivered (delivery) or … → Completed (dine-in / takeaway), or Cancelled.
- Delivery orders use the saved Account pin (or the browser location) as the destination.
- The map marker sits at the cafe until the admin sets **Out for delivery**, then moves to the customer over `TRIP_SECONDS`
  (`cafe/blueprints/orders.py`, demo animation). For a real courier, write `cur_lat` / `cur_lng` to the `orders` table from your driver app.
- If you have an old `instance/cafe.db`, delete the `instance/` folder once so the new `orders` columns are created.

## Account page
`/account` is now a profile page: username, email, contact number, preferred mode of payment (cash / GCash / Maya / card),
online-payment (e-wallet) number, and delivery address with a map pin. These pre-fill the menu's payment choice and the delivery
destination. Order history/tracking lives on **Your Order** (`/your-order`). Only the e-wallet number is stored, never card details.

## Admin
- Log in with the admin account (default **admin@newfoundcafe.com / admin123**, created on first run - set the `ADMIN_EMAIL` and
  `ADMIN_PASSWORD` environment variables *before the first run* to choose your own, or change it afterwards in the database). You land on `/admin`.
- `/admin` = sales analytics (totals, today, average order, 14-day chart, best sellers, category / payment / order-type breakdowns).
- `/admin/orders` = every order: change status (updates the customer's page), filter by status, and track the order on a Leaflet map.
- Code: `cafe/blueprints/admin.py`, templates `admin_*.html`. Any user can be made admin with `UPDATE users SET is_admin=1 WHERE email='...'`.

## Menu
Categories, colours, prices and photos live in `cafe/menu_data.py`. Photos are placeholders from loremflickr.com (keyword-based stock
photos) - replace with your own by putting files in `cafe/static/images/` and setting `img` to `/static/images/<file>`.
The landing-page carousel needs 3 clicks on the same photo to open the menu (`cafe/static/js/gallery.js`).

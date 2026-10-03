# PetWorld — Online Pet Store

A complete full-stack pet store web app: **HTML5/CSS3/JavaScript** frontend,
**Python Flask** REST API backend, and **MySQL** database — built to match
the PetWorld master requirements (login → welcome screen → home → dogs/food/services
→ favourites/cart/buy-now → checkout → account/orders/bookings → admin dashboard).

## Project structure

```
petworld/
├── backend/
│   ├── app.py                 # Flask app factory + blueprint registration
│   ├── config.py              # DB / JWT / mail configuration
│   ├── extensions.py          # SQLAlchemy, Bcrypt, JWT, CORS instances
│   ├── models.py              # All database models (matches schema.sql)
│   ├── utils.py                # ID generation, email sending, validation
│   ├── seed.py                 # Populates DB with breeds/food/services/admin
│   ├── schema.sql              # Reference raw SQL schema (optional - see below)
│   ├── requirements.txt
│   ├── .env.example            # Copy to .env and fill in your MySQL credentials
│   └── routes/
│       ├── __init__.py         # current_user() + admin_required() helpers
│       ├── auth.py             # register / login / logout / forgot / reset
│       ├── dogs.py             # dog breeds + admin CRUD
│       ├── food.py             # MBN food products + admin CRUD
│       ├── services.py         # Grooming/Training services + admin CRUD
│       ├── favourites.py       # per-user favourites
│       ├── cart.py             # per-user cart
│       ├── checkout.py         # Buy Now + full cart checkout
│       ├── orders.py           # view own orders
│       ├── bookings.py         # view own bookings
│       ├── account.py          # view/update own profile
│       └── admin.py            # customers/orders/bookings management
└── frontend/
    ├── index.html               # Login (entry point)
    ├── register.html
    ├── forgot-password.html
    ├── reset-password.html
    ├── home.html                # DOGS | FOOD | SERVICES cards
    ├── dogs.html / food.html / services.html
    ├── favourites.html / cart.html / checkout.html
    ├── account.html / orders.html / bookings.html
    ├── admin.html                # Admin Dashboard
    ├── css/style.css
    └── js/ (api.js + one file per page)
```

## 1. Prerequisites

- Python 3.10+
- MySQL Server 8.x running locally
- VS Code (or any editor)

## 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create the database in MySQL:

```sql
CREATE DATABASE petworld;
```

Copy `.env.example` to `.env` and fill in your real MySQL username/password:

```bash
cp .env.example .env
```

Create the tables and seed the required catalog (10 dog breeds, 8 MBN food
products, 2 service categories with packages, and one admin account):

```bash
python seed.py
```

This prints your **Admin login** to the console, e.g.:
```
User ID: ADMIN01 | Password: Admin@01
```
⚠️ Change this password in production — it's a starter credential for local testing.

Run the API:

```bash
python app.py
```

The API now runs at `http://localhost:5000`. Test it: `http://localhost:5000/api/health`.

## 3. Frontend setup

The frontend is plain HTML/CSS/JS — no build step needed. Because it calls the
Flask API from the browser, serve it over HTTP (not `file://`) to avoid CORS quirks.
Easiest option, from the `frontend/` folder:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser. `js/api.js` already points
`API_BASE` at `http://localhost:5000/api` — change that constant if your Flask
server runs elsewhere.

## 4. Using the app

1. Open the site → you land on the **Login** page.
2. Click **Register**, fill in your details (password must be exactly 8 characters).
3. Your generated **User ID** is shown on screen and printed to the Flask console
   (since no real SMTP is configured by default — see below).
4. Log in with that User ID + password → see **"WELCOME TO PETWORLD"** for 3
   seconds → land on **Home**.
5. Explore **Dogs** (pick an age, price updates live), **Food** (pick a weight),
   and **Services** (pick a package + date/time). Use ❤ to favourite, 🛒 to add
   to cart, or ⚡ Buy Now to check out immediately.
6. View your own **Orders**, **Bookings**, **Favourites**, and **Cart** from
   the Account page — all scoped privately to your login.
7. Log in as the seeded admin (`ADMIN01` / `Admin@01`) to reach the **Admin
   Dashboard** automatically, where you can manage breeds, food, services,
   view customers, and update order/booking statuses.

## 5. Sending real emails (optional)

By default, "emails" (User ID on registration, password-reset tokens) are just
printed to the Flask console — handy for local testing without SMTP setup.
To send real emails, set `MAIL_USERNAME` / `MAIL_PASSWORD` (an app password,
not your main password, if using Gmail) in `.env`.

## 6. Notes on a few implementation choices

- **Auth**: stateless JWT (`Flask-JWT-Extended`), stored in the browser's
  `localStorage` and sent as a `Bearer` token. This is simple and portable to
  any frontend host without server-side session storage.
- **Passwords**: hashed with bcrypt (`Flask-Bcrypt`); the spec's "exactly 8
  characters" rule is enforced both client-side and server-side.
- **User IDs**: randomly generated (`PW-XXXXXX`), never derived from the name.
- **Cart vs. Buy Now**: fully independent, as required — Buy Now skips the
  cart entirely and goes straight to checkout.
- **Privacy**: every favourites/cart/orders/bookings/account query is filtered
  by the JWT-authenticated user's ID at the database level, so one customer
  can never see another's data.
- Table creation currently happens via `db.create_all()` inside `seed.py`
  (SQLAlchemy reads the models). `schema.sql` is provided as a readable
  reference / for manual setup if you'd rather run raw SQL yourself.

## 7. Suggested next steps if you keep building

- Add real product photography (`frontend/images/...`) — placeholders currently
  use colored tiles with emoji so the project runs with zero external image
  dependencies.
- Add pagination if your catalog grows.
- Move the JWT secret/DB password out of source control entirely (already
  gitignored via `.env`, just don't commit real secrets).
- Add refresh tokens if you want sessions to last beyond `JWT_ACCESS_TOKEN_EXPIRES`.

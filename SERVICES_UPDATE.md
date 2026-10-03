# PetWorld — Services Feature Update (Store / Home + Live Tracking)

This update replaces ONLY the Services functionality. Login, registration,
dogs, food, cart, favourites and everything else are untouched.

## 1. Files changed / created

### Backend (`backend/`)
| File | Status |
|---|---|
| `service_logic.py` | **NEW** — Bengaluru boundary check, pricing rules, booking status flow |
| `service_models.py` | **NEW** — `Employee`, `ServiceBooking`, `EmployeeLocation` tables |
| `routes/service_bookings.py` | **NEW** — all customer + employee API endpoints |
| `setup_services.py` | **NEW** — run once to create the 3 new tables + 2 demo employees |
| `service_tables.sql` | **NEW** — reference SQL (optional, `setup_services.py` does this for you) |
| `app.py` | **REPLACED** — registers the 2 new blueprints |

### Frontend (`frontend/`)
| File | Status |
|---|---|
| `services.html` / `js/services.js` | **REPLACED** — service list now links to the booking page |
| `book-service.html` / `js/book-service.js` | **NEW** — Store/Home toggle, map, GPS, live price, confirm |
| `track-service.html` / `js/track-service.js` | **NEW** — customer's live tracking page |
| `bookings.html` / `js/bookings.js` | **REPLACED** — lists new-style bookings + a Track button, still shows any old bookings |
| `employee.html` / `js/employee.js` | **NEW** — employee login + dashboard |

No other file was touched.

## 2. Install one new Python package

Only Leaflet (map) is used on the frontend, loaded straight from a CDN — no
npm install needed. On the backend, everything needed is already in your
`requirements.txt` (Flask, SQLAlchemy, JWT, bcrypt). **Nothing new to `pip install`.**

## 3. MySQL — create the new tables

From `backend/` (venv active):
```bash
python setup_services.py
```
This creates `employees`, `service_bookings`, `employee_locations` and two
demo employees you can log in as immediately:

| Name | Email | Password | Gender |
|---|---|---|---|
| Ravi Kumar | ravi@petworld.com | Emp@1234 | Male |
| Priya Sharma | priya@petworld.com | Emp@1234 | Female |

(If you'd rather run raw SQL, `service_tables.sql` has the same table
definitions — but `setup_services.py` already does this for you.)

## 4. Restart Flask

```bash
python app.py
```

## 5. Test Store Service

1. Log in as a customer → **Services** → **Book Now** on either service.
2. Leave the mode on **🏪 Store Service** (default).
3. Pick a date/time/duration/number of dogs → price appears live on the right.
4. **Confirm Booking** → redirected to **My Bookings**, shows "🏪 Store Service".

## 6. Test Home Service + Bengaluru check

1. **Services** → **Book Now** → click **🏠 Home Service**.
2. Click **🎯 Use My Current Location** (your browser will ask for GPS
   permission — allow it), or click on the map to drop a pin manually / drag
   it to adjust. The address field auto-fills; you can edit it.
   - Try a point **inside** Bengaluru (e.g. click anywhere near MG Road,
     Koramangala, Whitefield, Electronic City) → you'll see
     **"✔ Your location is within Bengaluru."**
   - Try a point **outside** (e.g. click on Chennai or Mysuru on the map,
     zoom out first) → you'll see the blocking message and the Confirm
     button stays disabled.
3. Fill date/time/duration/dogs, choose **Male/Female provider**, confirm.
4. You're redirected straight to **Track Employee** for that booking.

## 7. Test employee-side + live tracking (2 browser windows)

**Window 1 (customer)** — you should already be on the Track page from step 6.
It polls every 5 seconds and currently says "Booking Confirmed — waiting for
employee to accept."

**Window 2 (employee)** — open `employee.html` (use a different browser or an
Incognito window so the two logins don't clash):
1. Log in as `ravi@petworld.com` / `Emp@1234` (or Priya, matching whichever
   gender you picked when booking).
2. You'll see the booking in **My Home-Service Bookings** with the customer's
   pin on the map.
3. Click **✔ Accept Booking**, then **🚗 Start Travel**.
   - Real GPS: your browser will ask for location permission — allow it,
     then physically your position (or your laptop's IP-based location)
     starts being sent every 5 seconds.
   - **No need to actually drive anywhere to test**: tick the **"Demo mode:
     simulate travel"** checkbox *before* pressing Start Travel. This makes
     a fake position glide toward the customer's pin automatically every 5
     seconds — perfect for a live demo/viva.
4. Watch **Window 1** (customer) — within ~5 seconds the banner changes to
   "🚗 ... is on the way!" and a 🚗 marker appears on their map, moving.
5. Back in the employee window, progress the booking: **Mark Arrived** →
   **Start Service** → **Complete Service**. Watch each step reflect live
   in the customer's tracking page and status timeline.
6. Once completed, the 🚗 marker disappears from the customer's map (tracking
   stops, as required).

## 8. Privacy check (quick sanity test)

- Log in as the *other* employee (the one NOT assigned to this booking) —
  their dashboard will NOT show this booking at all.
- Try opening another customer's tracking link while logged in as a
  different customer — you'll get "not found" rather than their booking.

## 9. Payment Methods (COD / UPI / Card)

Added to all three checkout points: **Buy Now** (dogs/food), **Cart Checkout**,
and **Service Booking**. This is a **mock payment flow** for a college
project — no real payment gateway is integrated anywhere.

- **COD**: no extra input needed.
- **UPI**: enter any UPI-ID-shaped value (e.g. `name@okhdfcbank`) — format
  checked on both frontend and backend, not actually charged.
- **Card**: enter any 13–19 digit number, MM/YY expiry, and a 3–4 digit CVV
  — format checked only (Luhn/real card validation is intentionally not
  implemented, since no real charge happens). The stored reference is a
  masked number like `**** **** **** 1234`, never the full card number.

New DB columns: `orders.payment_method`, `orders.payment_reference`,
`service_bookings.payment_method`, `service_bookings.payment_reference`.

⚠️ **Important**: `db.create_all()` (used by `seed.py` / `setup_services.py`)
only creates tables that don't exist yet — it does **not** add new columns
to a table you already created earlier. Since your `orders` table already
existed before this update, you need to add the two new columns manually,
**once**, with this SQL (run it in MySQL Command Line Client or Workbench):

```sql
USE petworld;
ALTER TABLE orders           ADD COLUMN payment_method    VARCHAR(20)  DEFAULT 'COD';
ALTER TABLE orders           ADD COLUMN payment_reference VARCHAR(100);
ALTER TABLE service_bookings ADD COLUMN payment_method    VARCHAR(20)  DEFAULT 'COD';
ALTER TABLE service_bookings ADD COLUMN payment_reference VARCHAR(100);
```

(If `service_bookings` doesn't exist yet because you haven't run
`setup_services.py` at all yet, just run `python setup_services.py` first —
it will create that table already including these columns, and you'd only
need the two `ALTER TABLE orders ...` lines above.)

**To test:** on any checkout page, try switching between the three payment
buttons — the fields below change. Try submitting with an invalid UPI ID or
an incomplete card to see the validation error, then submit correctly and
confirm the payment method + reference show up on the Orders / Bookings page.


- **Bengaluru check** uses a simple bounding-box (rectangle) around the
  city rather than the exact municipal polygon — accurate enough for a
  college project and easy to explain/defend; mention this if asked.
- **Live GPS**: real browser GPS works (`navigator.geolocation.watchPosition`),
  sent to Flask every 5 seconds and read back by the customer's polling
  page every 5 seconds. This is a realistic *polling* architecture (not
  WebSockets) — simpler to explain and demo reliably, at the cost of a few
  seconds of lag versus a production app like Zepto (which typically uses
  WebSockets/sockets for instant push updates). You can mention this as a
  "future enhancement" if asked.
- **Pricing** is a simple, explainable formula (hourly rate × duration,
  +70% per additional dog, +₹150 flat for home visits) — see
  `service_logic.py` → `calculate_price()` if you need to justify or tweak
  the numbers.

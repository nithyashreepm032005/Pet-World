"""
One-time price update for the two PetWorld services.

Raises the prices of the ONLY two services in the app:
    Grooming & Spa         -> starting price  Rs 1,499
    Training & Behavioral  -> starting price  Rs 1,999

It does exactly three things, and is safe to run more than once:

  1. Adds the pricing columns `services.base_price` / `services.home_price`
     if they are missing (db.create_all() never alters an existing table).
  2. Writes the new hourly rates on each existing service row.
  3. Updates the display prices of that service's existing packages
     (higher tiers cost more - it never sets one flat price for every option).

It NEVER touches `service_bookings`, `bookings`, `orders` or any customer
record, so the prices already recorded on existing/historical bookings are
preserved exactly as they were.

Run from the backend folder (venv active):
    python update_service_prices.py
"""
import models            # noqa: F401  - services / service_packages tables
import service_models    # noqa: F401
from sqlalchemy import inspect, text

from app import create_app
from extensions import db
from models import Service

app = create_app()

# Hourly rate (Rs, first dog) - the Store 1-hour rate is the "starting price".
SERVICE_RATES = {
    "grooming": {"base": 1499, "home": 1875},
    "training": {"base": 1999, "home": 2999},
}

# New package tiers. The cheapest package of each service equals its starting
# price; the larger packages sit above it.
PACKAGE_PRICES = {
    "grooming": {
        "Basic Bath & Brush": 1499,
        "Full Grooming Package": 2499,
        "Spa Deluxe Package": 3499,
    },
    "training": {
        "Puppy Training Program": 1999,
        "Basic Obedience Training": 2499,
        "Behavioral Correction Program": 2999,
    },
}


def service_category(name):
    return "training" if "training" in (name or "").lower() else "grooming"


def ensure_price_columns():
    columns = {c["name"] for c in inspect(db.engine).get_columns("services")}
    if "base_price" not in columns:
        db.session.execute(text("ALTER TABLE services ADD COLUMN base_price NUMERIC(10,2) NULL"))
        print("Added services.base_price")
    if "home_price" not in columns:
        db.session.execute(text("ALTER TABLE services ADD COLUMN home_price NUMERIC(10,2) NULL"))
        print("Added services.home_price")
    db.session.commit()


def update_services():
    updated_services = 0
    updated_packages = 0
    for service in Service.query.all():
        category = service_category(service.service_name)
        rates = SERVICE_RATES[category]

        service.base_price = rates["base"]
        service.home_price = rates["home"]
        updated_services += 1
        print(f"  {service.service_name}: store Rs {rates['base']}/hr, "
              f"home Rs {rates['home']}/hr")

        for package in service.packages:
            new_price = PACKAGE_PRICES[category].get(package.package_name)
            if new_price is None:
                # A package the admin added themselves - leave it alone.
                continue
            package.price = new_price
            updated_packages += 1

    print(f"Updated {updated_services} services and {updated_packages} package prices.")


if __name__ == "__main__":
    with app.app_context():
        ensure_price_columns()
        update_services()
        db.session.commit()
        print("Done! Service prices updated. Existing bookings were not changed.")

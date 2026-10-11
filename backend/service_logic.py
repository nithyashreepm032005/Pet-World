"""
Business rules for the Services feature (Store Service / Home Service).

This file has NO Flask or database imports on purpose, so the rules can be
read, tested and changed in one place.
"""
from datetime import time as dtime

# ---------------------------------------------------------------------------
# Bengaluru service area
# ---------------------------------------------------------------------------
# Approximate bounding box around Bengaluru city (BBMP limits). A point inside
# this box is treated as "within Bengaluru". Good enough for a college project;
# a production app would use a proper city-boundary polygon.
BENGALURU_BOUNDS = {
    "min_lat": 12.834,
    "max_lat": 13.144,
    "min_lng": 77.460,
    "max_lng": 77.784,
}

OUTSIDE_BENGALURU_MESSAGE = "Home service is currently available only within Bengaluru."


def in_bengaluru(lat, lng):
    b = BENGALURU_BOUNDS
    return b["min_lat"] <= lat <= b["max_lat"] and b["min_lng"] <= lng <= b["max_lng"]


# ---------------------------------------------------------------------------
# Booking rules
# ---------------------------------------------------------------------------
ALLOWED_DURATIONS = (1.0, 1.5, 2.0, 3.0)   # hours
MAX_DOGS = 5
FIRST_SLOT = dtime(9, 0)                   # service hours: 09:00 - 18:00 start times
LAST_SLOT = dtime(18, 0)
PROVIDER_GENDERS = ("Male", "Female")

# ---------------------------------------------------------------------------
# Pricing  (Rs per hour for the FIRST dog)
# ---------------------------------------------------------------------------
# The authoritative rates live on the `services` table (base_price = store,
# home_price = home) so the Admin Dashboard can change them without any code
# edit. These defaults are only a fallback for a service whose rates haven't
# been saved yet (e.g. a brand new service category).
DEFAULT_RATES = {
    "grooming": {"store": 1499, "home": 1875},
    "training": {"store": 1999, "home": 2999},
}
HOME_TRAVEL_FEE = 150          # flat fee for home visits
ADDITIONAL_DOG_FACTOR = 0.7    # each extra dog costs 70% of the hourly rate


def service_category(service_name):
    return "training" if "training" in (service_name or "").lower() else "grooming"


def rates_for_service(service):
    """Return {'store': .., 'home': ..} for a service.

    Prefers the rates stored on the Service row and falls back to
    DEFAULT_RATES for the service's category. `service` may be a Service model
    instance or any object exposing service_name / base_price / home_price.
    """
    base = getattr(service, "base_price", None)
    home = getattr(service, "home_price", None)
    try:
        base, home = float(base), float(home)
    except (TypeError, ValueError):
        base = home = 0
    if base > 0 and home > 0:
        return {"store": base, "home": home}
    return DEFAULT_RATES[service_category(getattr(service, "service_name", ""))]


def calculate_price(service, mode, hours, dogs):
    """Returns a price breakdown dict. All amounts are whole rupees.

    `service` is a Service model instance (or a lightweight object with
    service_name + base_price/home_price); its own saved rates drive the price.
    """
    rate = rates_for_service(service)[mode]
    first_dog = rate * hours
    additional = rate * hours * ADDITIONAL_DOG_FACTOR * (dogs - 1)
    travel = HOME_TRAVEL_FEE if mode == "home" else 0
    return {
        "hourly_rate": round(rate),
        "first_dog": round(first_dog),
        "additional_dogs": round(additional),
        "travel_fee": travel,
        "total": round(first_dog + additional + travel),
    }


# ---------------------------------------------------------------------------
# Status flow for HOME bookings
# ---------------------------------------------------------------------------
STATUS_CONFIRMED = "Booking Confirmed"
STATUS_ASSIGNED = "Employee Assigned"
STATUS_ON_THE_WAY = "On the Way"
STATUS_ARRIVED = "Arrived"
STATUS_STARTED = "Service Started"
STATUS_COMPLETED = "Service Completed"

# action name (used in the URL) -> (status it requires, status it moves to)
TRANSITIONS = {
    "accept": (STATUS_CONFIRMED, STATUS_ASSIGNED),
    "start-travel": (STATUS_ASSIGNED, STATUS_ON_THE_WAY),
    "arrived": (STATUS_ON_THE_WAY, STATUS_ARRIVED),
    "start-service": (STATUS_ARRIVED, STATUS_STARTED),
    "complete": (STATUS_STARTED, STATUS_COMPLETED),
}

# Employee location is shared with the customer only in these statuses.
ACTIVE_TRACKING = (STATUS_ON_THE_WAY, STATUS_ARRIVED, STATUS_STARTED)

# Bookings that still count towards an employee's workload.
OPEN_STATUSES = (STATUS_CONFIRMED, STATUS_ASSIGNED, STATUS_ON_THE_WAY,
                 STATUS_ARRIVED, STATUS_STARTED)

"""
Services feature routes.

Customer side  (prefix /api):
    POST /service-bookings/quote            -> price preview
    POST /service-bookings/check-location   -> is a map point inside Bengaluru?
    POST /service-bookings                  -> create a Store / Home booking
    GET  /service-bookings                  -> my bookings
    GET  /service-bookings/<id>             -> one of my bookings
    GET  /service-bookings/<id>/tracking    -> booking + employee live location

Employee side  (prefix /api):
    POST /employee/login
    GET  /employee/bookings
    POST /employee/bookings/<id>/<action>   accept | start-travel | arrived |
                                            start-service | complete
    POST /employee/location/<id>            -> send GPS position
"""
import random
from datetime import datetime
from functools import wraps

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, verify_jwt_in_request, get_jwt, get_jwt_identity,
)

from extensions import db, bcrypt
from models import User, Service
from service_models import Employee, ServiceBooking, EmployeeLocation
from service_logic import (
    ALLOWED_DURATIONS, MAX_DOGS, FIRST_SLOT, LAST_SLOT, PROVIDER_GENDERS,
    OUTSIDE_BENGALURU_MESSAGE, in_bengaluru, calculate_price,
    TRANSITIONS, ACTIVE_TRACKING, OPEN_STATUSES,
    STATUS_CONFIRMED, STATUS_COMPLETED,
)
from utils import validate_payment

service_bp = Blueprint("service_bookings", __name__)
employee_bp = Blueprint("employee", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def customer_required(fn):
    """Logged-in customer (or admin) only - employee tokens are rejected."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get("role") == "employee":
            return jsonify({"error": "Please log in as a customer."}), 403
        user = User.query.get(int(get_jwt_identity()))
        if not user:
            return jsonify({"error": "User not found."}), 401
        return fn(user, *args, **kwargs)
    return wrapper


def employee_required(fn):
    """Logged-in employee only. Employee JWT identity looks like 'emp-3'."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if get_jwt().get("role") != "employee":
            return jsonify({"error": "Employee access required."}), 403
        try:
            emp_id = int(str(get_jwt_identity()).split("-", 1)[1])
        except (IndexError, ValueError):
            return jsonify({"error": "Invalid employee token."}), 401
        emp = Employee.query.get(emp_id)
        if not emp or not emp.is_active:
            return jsonify({"error": "Employee account not found."}), 401
        return fn(emp, *args, **kwargs)
    return wrapper


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_coords(data):
    lat, lng = _to_float(data.get("latitude")), _to_float(data.get("longitude"))
    if lat is None or lng is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None, None
    return lat, lng


def _new_booking_id():
    while True:
        booking_id = "SB" + "".join(random.choices("0123456789", k=8))
        if not ServiceBooking.query.filter_by(booking_id=booking_id).first():
            return booking_id


def _pick_employee(gender):
    """Active employee of the requested gender with the fewest open bookings."""
    employees = Employee.query.filter_by(gender=gender, is_active=True).all()
    if not employees:
        return None

    def workload(emp):
        return ServiceBooking.query.filter(
            ServiceBooking.employee_id == emp.id,
            ServiceBooking.booking_status.in_(OPEN_STATUSES),
        ).count()

    return min(employees, key=workload)


def booking_to_dict(b, include_customer=False):
    data = {
        "id": b.id,
        "booking_id": b.booking_id,
        "service_id": b.service_id,
        "service_name": b.service_name,
        "service_mode": b.service_mode,
        "date": b.booking_date.isoformat(),
        "time": b.booking_time.strftime("%H:%M"),
        "duration_hours": float(b.duration_hours),
        "provider_gender": b.provider_gender,
        "number_of_dogs": b.number_of_dogs,
        "price": float(b.price),
        "address": b.address,
        "latitude": float(b.latitude) if b.latitude is not None else None,
        "longitude": float(b.longitude) if b.longitude is not None else None,
        "status": b.booking_status,
        "employee_name": b.employee.name if b.employee else None,
        "employee_phone": b.employee.phone if b.employee else None,
        "payment_method": b.payment_method,
        "payment_reference": b.payment_reference,
    }
    if include_customer:
        data["customer_name"] = b.user.full_name
        data["customer_phone"] = b.user.phone
    return data


# ---------------------------------------------------------------------------
# Customer endpoints
# ---------------------------------------------------------------------------
@service_bp.route("/service-bookings/quote", methods=["POST"])
@customer_required
def quote(user):
    data = request.get_json(force=True) or {}
    service = Service.query.get(data.get("service_id"))
    mode = data.get("service_mode")
    hours = _to_float(data.get("duration_hours"))
    try:
        dogs = int(data.get("number_of_dogs"))
    except (TypeError, ValueError):
        dogs = None

    if not service or mode not in ("store", "home"):
        return jsonify({"error": "Choose a service and a service mode."}), 400
    if hours not in ALLOWED_DURATIONS or dogs is None or not 1 <= dogs <= MAX_DOGS:
        return jsonify({"error": "Choose a valid duration and number of dogs."}), 400

    return jsonify(calculate_price(service.service_name, mode, hours, dogs)), 200


@service_bp.route("/service-bookings/check-location", methods=["POST"])
@customer_required
def check_location(user):
    lat, lng = _parse_coords(request.get_json(force=True) or {})
    if lat is None:
        return jsonify({"error": "Invalid location."}), 400
    inside = in_bengaluru(lat, lng)
    return jsonify({
        "in_bengaluru": inside,
        "message": "Location is within Bengaluru." if inside else OUTSIDE_BENGALURU_MESSAGE,
    }), 200


@service_bp.route("/service-bookings", methods=["POST"])
@customer_required
def create_service_booking(user):
    data = request.get_json(force=True) or {}

    service = Service.query.get(data.get("service_id"))
    if not service or not service.availability:
        return jsonify({"error": "This service is not available."}), 400

    mode = data.get("service_mode")
    if mode not in ("store", "home"):
        return jsonify({"error": "Choose Store Service or Home Service."}), 400

    # ---- date & time ----
    try:
        booking_date = datetime.strptime(str(data.get("date") or ""), "%Y-%m-%d").date()
        booking_time = datetime.strptime(str(data.get("time") or ""), "%H:%M").time()
    except ValueError:
        return jsonify({"error": "Please select a valid date and time."}), 400

    now = datetime.now()
    if booking_date < now.date():
        return jsonify({"error": "You cannot book a date in the past."}), 400
    if booking_date == now.date() and booking_time <= now.time():
        return jsonify({"error": "Please choose a time later than the current time."}), 400
    if not (FIRST_SLOT <= booking_time <= LAST_SLOT):
        return jsonify({"error": "Bookings are available between 9:00 AM and 6:00 PM."}), 400

    # ---- duration & dogs ----
    hours = _to_float(data.get("duration_hours"))
    if hours not in ALLOWED_DURATIONS:
        return jsonify({"error": "Please select a valid duration."}), 400
    try:
        dogs = int(data.get("number_of_dogs"))
    except (TypeError, ValueError):
        dogs = 0
    if not 1 <= dogs <= MAX_DOGS:
        return jsonify({"error": f"Number of dogs must be between 1 and {MAX_DOGS}."}), 400

    # ---- mode specific ----
    address = lat = lng = provider_gender = employee = None

    if mode == "home":
        lat, lng = _parse_coords(data)
        if lat is None:
            return jsonify({"error": "Please select your location for home service."}), 400
        if not in_bengaluru(lat, lng):
            return jsonify({"error": OUTSIDE_BENGALURU_MESSAGE}), 400

        address = (data.get("address") or "").strip()
        if len(address) < 5:
            return jsonify({"error": "Please provide your address."}), 400

        provider_gender = data.get("provider_gender")
        if provider_gender not in PROVIDER_GENDERS:
            return jsonify({"error": "Please choose a male or female service provider."}), 400

        employee = _pick_employee(provider_gender)
        if not employee:
            return jsonify({
                "error": f"No {provider_gender.lower()} service provider is available right now. "
                         "Please try the other option."
            }), 409

    price = calculate_price(service.service_name, mode, hours, dogs)["total"]

    try:
        payment_reference = validate_payment(
            data.get("payment_method"), data.get("payment_details")
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    booking = ServiceBooking(
        booking_id=_new_booking_id(),
        user_id=user.id,
        service_id=service.id,
        service_name=service.service_name,
        service_mode=mode,
        booking_date=booking_date,
        booking_time=booking_time,
        duration_hours=hours,
        provider_gender=provider_gender,
        number_of_dogs=dogs,
        price=price,
        address=address,
        latitude=lat,
        longitude=lng,
        payment_method=data.get("payment_method"),
        payment_reference=payment_reference,
        employee_id=employee.id if employee else None,
        booking_status=STATUS_CONFIRMED,
    )
    db.session.add(booking)
    db.session.commit()

    return jsonify({"message": "Booking confirmed!", "booking": booking_to_dict(booking)}), 201


@service_bp.route("/service-bookings", methods=["GET"])
@customer_required
def list_my_service_bookings(user):
    bookings = (ServiceBooking.query.filter_by(user_id=user.id)
                .order_by(ServiceBooking.id.desc()).all())
    return jsonify([booking_to_dict(b) for b in bookings]), 200


@service_bp.route("/service-bookings/<int:booking_id>", methods=["GET"])
@customer_required
def get_my_service_booking(user, booking_id):
    b = ServiceBooking.query.filter_by(id=booking_id, user_id=user.id).first_or_404()
    return jsonify(booking_to_dict(b)), 200


@service_bp.route("/service-bookings/<int:booking_id>/tracking", methods=["GET"])
@customer_required
def track_employee(user, booking_id):
    # Only the customer who owns this booking can see it (others get 404).
    b = ServiceBooking.query.filter_by(id=booking_id, user_id=user.id).first_or_404()
    if b.service_mode != "home":
        return jsonify({"error": "Tracking is only available for home service bookings."}), 400

    tracking_active = b.booking_status in ACTIVE_TRACKING
    employee_location = None
    if tracking_active:
        row = EmployeeLocation.query.filter_by(booking_id=b.id).first()
        if row:
            employee_location = {
                "latitude": float(row.latitude),
                "longitude": float(row.longitude),
                "seconds_ago": max(0, int((datetime.utcnow() - row.updated_at).total_seconds())),
            }

    return jsonify({
        "booking": booking_to_dict(b),
        "tracking_active": tracking_active,
        "employee_location": employee_location,
    }), 200


# ---------------------------------------------------------------------------
# Employee endpoints
# ---------------------------------------------------------------------------
@employee_bp.route("/employee/login", methods=["POST"])
def employee_login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    emp = Employee.query.filter_by(email=email, is_active=True).first()
    if not emp or not bcrypt.check_password_hash(emp.password_hash, password):
        return jsonify({"error": "Invalid email or password."}), 401

    token = create_access_token(identity=f"emp-{emp.id}",
                                additional_claims={"role": "employee"})
    return jsonify({"token": token,
                    "employee": {"id": emp.id, "name": emp.name, "gender": emp.gender}}), 200


@employee_bp.route("/employee/bookings", methods=["GET"])
@employee_required
def employee_bookings(emp):
    # An employee only ever sees bookings assigned to THEM
    # (this is what keeps the customer's location private).
    bookings = (ServiceBooking.query
                .filter_by(employee_id=emp.id, service_mode="home")
                .order_by(ServiceBooking.booking_date, ServiceBooking.booking_time).all())
    return jsonify([booking_to_dict(b, include_customer=True) for b in bookings]), 200


@employee_bp.route("/employee/bookings/<int:booking_id>/<action>", methods=["POST"])
@employee_required
def employee_action(emp, booking_id, action):
    if action not in TRANSITIONS:
        return jsonify({"error": "Unknown action."}), 404

    b = ServiceBooking.query.filter_by(id=booking_id, employee_id=emp.id).first_or_404()
    required_status, new_status = TRANSITIONS[action]
    if b.booking_status != required_status:
        return jsonify({
            "error": f"This step is not available now. Current status: {b.booking_status}."
        }), 400

    b.booking_status = new_status
    if new_status == STATUS_COMPLETED:
        # Tracking stops when the service is completed - remove the location.
        EmployeeLocation.query.filter_by(booking_id=b.id).delete()
    db.session.commit()
    return jsonify({"booking": booking_to_dict(b, include_customer=True)}), 200


@employee_bp.route("/employee/location/<int:booking_id>", methods=["POST"])
@employee_required
def update_location(emp, booking_id):
    b = ServiceBooking.query.filter_by(id=booking_id, employee_id=emp.id).first_or_404()
    if b.booking_status not in ACTIVE_TRACKING:
        return jsonify({"error": "Location tracking is not active for this booking."}), 400

    lat, lng = _parse_coords(request.get_json(force=True) or {})
    if lat is None:
        return jsonify({"error": "Invalid location."}), 400

    row = EmployeeLocation.query.filter_by(booking_id=b.id).first()
    if row is None:
        row = EmployeeLocation(employee_id=emp.id, booking_id=b.id, latitude=lat, longitude=lng)
        db.session.add(row)
    row.employee_id = emp.id
    row.latitude = lat
    row.longitude = lng
    row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Location updated."}), 200

from datetime import datetime

from flask import Blueprint, request, jsonify
from extensions import db
from models import User, Order, Booking
from service_models import ServiceBooking
from service_logic import (
    STATUS_CONFIRMED, STATUS_ASSIGNED, STATUS_ON_THE_WAY, STATUS_ARRIVED,
    STATUS_STARTED, STATUS_COMPLETED,
)
from return_models import ReturnRequest, RETURN_STATUSES
from routes import admin_required

admin_bp = Blueprint("admin", __name__)

VALID_ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"]
VALID_BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"]
# Statuses the admin can set on a customer service booking. These mirror the
# customer/employee flow (service_logic.py) plus a terminal "Cancelled".
VALID_SERVICE_BOOKING_STATUSES = [
    STATUS_CONFIRMED, STATUS_ASSIGNED, STATUS_ON_THE_WAY, STATUS_ARRIVED,
    STATUS_STARTED, STATUS_COMPLETED, "Cancelled",
]


def _service_booking_admin_dict(b):
    return {
        "id": b.id,
        "source": "service",
        "booking_id": b.booking_id,
        "customer_name": b.user.full_name if b.user else None,
        "customer_user_id": b.user.user_id if b.user else None,
        "customer_phone": b.user.phone if b.user else None,
        "pet_id": b.pet_id,
        "pet_name": b.pet_name,
        "service_name": b.service_name,
        "service_mode": b.service_mode,
        "booking_date": b.booking_date.isoformat() if b.booking_date else None,
        "booking_time": b.booking_time.strftime("%H:%M") if b.booking_time else None,
        "price": float(b.price),
        "status": b.booking_status,
        "number_of_dogs": b.number_of_dogs,
        "payment_method": b.payment_method,
        "address": b.address,
        "latitude": float(b.latitude) if b.latitude is not None else None,
        "longitude": float(b.longitude) if b.longitude is not None else None,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def _legacy_booking_admin_dict(b):
    return {
        "id": b.id,
        "source": "legacy",
        "booking_id": b.booking_id,
        "customer_name": b.user.full_name if b.user else None,
        "customer_user_id": b.user.user_id if b.user else None,
        "customer_phone": b.user.phone if b.user else None,
        "pet_id": None,
        "pet_name": None,
        "service_name": b.service.service_name if b.service else None,
        "package_name": b.package.package_name if b.package else None,
        "booking_date": b.booking_date,
        "booking_time": b.booking_time,
        "price": float(b.price),
        "status": b.status,
        "number_of_dogs": None,
        "payment_method": None,
        "created_at": None,
    }


@admin_bp.route("/admin/customers", methods=["GET"])
@admin_required
def list_customers():
    customers = User.query.filter_by(role="customer").all()
    return jsonify([c.to_dict() for c in customers]), 200


@admin_bp.route("/admin/customers/<int:user_id>", methods=["GET"])
@admin_required
def get_customer(user_id):
    customer = User.query.filter_by(id=user_id, role="customer").first_or_404()
    return jsonify(customer.to_dict()), 200


@admin_bp.route("/admin/orders", methods=["GET"])
@admin_required
def list_all_orders():
    orders = Order.query.order_by(Order.order_date.desc()).all()
    return jsonify([o.to_dict() for o in orders]), 200


@admin_bp.route("/admin/orders/<int:order_id>/status", methods=["PUT"])
@admin_required
def update_order_status(order_id):
    order = Order.query.get_or_404(order_id)
    data = request.get_json(force=True)
    status = data.get("status")
    if status not in VALID_ORDER_STATUSES:
        return jsonify({"error": f"Status must be one of {VALID_ORDER_STATUSES}."}), 400

    order.status = status
    # The 7-day return window is measured from the actual delivery date, so
    # we capture it the moment an order first becomes "Delivered" - never
    # overwritten if the admin re-saves the same status later.
    if status == "Delivered" and order.delivered_at is None:
        order.delivered_at = datetime.utcnow()

    db.session.commit()
    return jsonify(order.to_dict()), 200


@admin_bp.route("/admin/bookings", methods=["GET"])
@admin_required
def list_all_bookings():
    """Every booking a customer has made.

    Customer service bookings (the current Services flow) live in
    `service_bookings`; older bookings made through the legacy checkout live
    in `bookings`. Both are returned (newest first) so the admin dashboard
    shows the real bookings regardless of which flow created them.
    """
    service_bookings = (ServiceBooking.query
                        .order_by(ServiceBooking.id.desc()).all())
    legacy_bookings = Booking.query.order_by(Booking.id.desc()).all()

    rows = ([_service_booking_admin_dict(b) for b in service_bookings]
            + [_legacy_booking_admin_dict(b) for b in legacy_bookings])
    rows.sort(key=lambda r: (r.get("created_at") or "", r["id"]), reverse=True)
    return jsonify(rows), 200


@admin_bp.route("/admin/bookings/<int:booking_id>/status", methods=["PUT"])
@admin_required
def update_booking_status(booking_id):
    data = request.get_json(force=True)
    status = data.get("status")
    source = data.get("source", "legacy")

    if source == "service":
        booking = ServiceBooking.query.get_or_404(booking_id)
        if status not in VALID_SERVICE_BOOKING_STATUSES:
            return jsonify({"error": f"Status must be one of {VALID_SERVICE_BOOKING_STATUSES}."}), 400
        booking.booking_status = status
        db.session.commit()
        return jsonify(_service_booking_admin_dict(booking)), 200

    booking = Booking.query.get_or_404(booking_id)
    if status not in VALID_BOOKING_STATUSES:
        return jsonify({"error": f"Status must be one of {VALID_BOOKING_STATUSES}."}), 400
    booking.status = status
    db.session.commit()
    return jsonify(_legacy_booking_admin_dict(booking)), 200


# ---------------------------------------------------------------------------
# Return requests
# ---------------------------------------------------------------------------
@admin_bp.route("/admin/returns", methods=["GET"])
@admin_required
def list_returns():
    returns = ReturnRequest.query.order_by(ReturnRequest.request_date.desc()).all()
    return jsonify([r.to_dict(include_order=True) for r in returns]), 200


@admin_bp.route("/admin/returns/<int:return_id>/status", methods=["PUT"])
@admin_required
def update_return_status(return_id):
    rr = ReturnRequest.query.get_or_404(return_id)
    data = request.get_json(force=True)
    status = data.get("status")
    if status not in RETURN_STATUSES:
        return jsonify({"error": f"Status must be one of {list(RETURN_STATUSES)}."}), 400
    rr.status = status
    db.session.commit()
    return jsonify(rr.to_dict(include_order=True)), 200
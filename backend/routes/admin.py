from datetime import datetime

from flask import Blueprint, request, jsonify
from extensions import db
from models import User, Order, Booking
from return_models import ReturnRequest, RETURN_STATUSES
from routes import admin_required

admin_bp = Blueprint("admin", __name__)

VALID_ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"]
VALID_BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"]


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
    bookings = Booking.query.order_by(Booking.id.desc()).all()
    return jsonify([b.to_dict() for b in bookings]), 200


@admin_bp.route("/admin/bookings/<int:booking_id>/status", methods=["PUT"])
@admin_required
def update_booking_status(booking_id):
    booking = Booking.query.get_or_404(booking_id)
    data = request.get_json(force=True)
    status = data.get("status")
    if status not in VALID_BOOKING_STATUSES:
        return jsonify({"error": f"Status must be one of {VALID_BOOKING_STATUSES}."}), 400
    booking.status = status
    db.session.commit()
    return jsonify(booking.to_dict()), 200


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
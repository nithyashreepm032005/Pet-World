from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from extensions import db
from models import Order
from routes import current_user
from return_models import ReturnRequest, RETURN_STATUSES

orders_bp = Blueprint("orders", __name__)

CANCEL_WINDOW = timedelta(hours=24)
RETURN_WINDOW = timedelta(days=7)

# Order statuses at/after this point mean "already on its way / done" -
# too late for a simple self-service cancellation.
NOT_CANCELLABLE_STATUSES = ("Shipped", "Delivered", "Cancelled")


def _order_extra_fields(order):
    """Adds cancellation/return eligibility, computed on the SERVER (not
    trusted to the browser), to an order's dict."""
    now = datetime.utcnow()
    contains_dog = any(i.item_type == "dog" for i in order.items)

    # ---- Cancellation: within 24h of placing the order ----
    cancel_deadline = order.order_date + CANCEL_WINDOW
    can_cancel = (
        now <= cancel_deadline
        and order.status not in NOT_CANCELLABLE_STATUSES
    )

    # ---- Return: within 7 days of DELIVERY, food orders only.
    # Live dogs are not self-service returnable - direct the customer to
    # contact support instead, since returning a living animal isn't the
    # same process as returning packaged food. ----
    return_deadline = (order.delivered_at + RETURN_WINDOW) if order.delivered_at else None
    existing_return = ReturnRequest.query.filter_by(order_id=order.id).first()
    can_return = (
        order.status == "Delivered"
        and order.delivered_at is not None
        and now <= return_deadline
        and not contains_dog
        and existing_return is None
    )

    return {
        "contains_dog": contains_dog,
        "cancel_deadline": cancel_deadline.isoformat(),
        "can_cancel": can_cancel,
        "return_deadline": return_deadline.isoformat() if return_deadline else None,
        "can_return": can_return,
        "return_request": existing_return.to_dict() if existing_return else None,
    }


def _full_order_dict(order):
    data = order.to_dict()
    data.update(_order_extra_fields(order))
    return data


@orders_bp.route("/orders", methods=["GET"])
@jwt_required()
def list_orders():
    user = current_user()
    orders = (
        Order.query.filter_by(user_id=user.id)
        .order_by(Order.order_date.desc())
        .all()
    )
    return jsonify([_full_order_dict(o) for o in orders]), 200


@orders_bp.route("/orders/<int:order_id>", methods=["GET"])
@jwt_required()
def get_order(order_id):
    user = current_user()
    order = Order.query.filter_by(id=order_id, user_id=user.id).first_or_404()
    return jsonify(_full_order_dict(order)), 200


@orders_bp.route("/orders/<int:order_id>/cancel", methods=["POST"])
@jwt_required()
def cancel_order(order_id):
    """Customer-initiated cancellation. Eligibility is re-checked here on
    the server - the button only being hidden on the frontend is not
    treated as a security boundary."""
    user = current_user()
    order = Order.query.filter_by(id=order_id, user_id=user.id).first_or_404()

    now = datetime.utcnow()
    if order.status in NOT_CANCELLABLE_STATUSES:
        return jsonify({"error": f"This order is already '{order.status}' and can no longer be cancelled."}), 400
    if now > order.order_date + CANCEL_WINDOW:
        return jsonify({"error": "The 24-hour cancellation window for this order has expired."}), 400

    order.status = "Cancelled"
    db.session.commit()
    return jsonify({"message": "Order cancelled successfully.", "order": _full_order_dict(order)}), 200


@orders_bp.route("/orders/<int:order_id>/return", methods=["POST"])
@jwt_required()
def request_return(order_id):
    """Food-only self-service return request. Orders containing a live dog
    are intentionally excluded - handled separately via customer support,
    since a living animal cannot be 'returned' the way packaged food can."""
    user = current_user()
    order = Order.query.filter_by(id=order_id, user_id=user.id).first_or_404()
    data = request.get_json(force=True) or {}
    reason = (data.get("reason") or "").strip()

    if any(i.item_type == "dog" for i in order.items):
        return jsonify({
            "error": "Live animals can't be returned through this page. "
                     "Please contact PetWorld support directly for help with a dog order."
        }), 400

    if order.status != "Delivered" or order.delivered_at is None:
        return jsonify({"error": "This order has not been marked as delivered yet."}), 400

    now = datetime.utcnow()
    if now > order.delivered_at + RETURN_WINDOW:
        return jsonify({"error": "The 7-day return window for this order has expired."}), 400

    if ReturnRequest.query.filter_by(order_id=order.id).first():
        return jsonify({"error": "A return request already exists for this order."}), 409

    if len(reason) < 5:
        return jsonify({"error": "Please tell us briefly why you'd like to return this order."}), 400

    rr = ReturnRequest(order_id=order.id, user_id=user.id, reason=reason, status="Pending")
    db.session.add(rr)
    db.session.commit()
    return jsonify({"message": "Return request submitted.", "order": _full_order_dict(order)}), 201
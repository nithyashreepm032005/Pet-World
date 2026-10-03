from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from extensions import db
from models import Order, OrderItem, Booking, Cart, CartItem
from routes import current_user
from utils import generate_order_id, generate_booking_id, validate_payment, validate_delivery_address

checkout_bp = Blueprint("checkout", __name__)

FREE_DELIVERY_THRESHOLD = 1000
DELIVERY_CHARGE = 100


def _apply_delivery_charge(goods_subtotal):
    """Physical goods (dogs/food) under the free-delivery threshold get a
    flat delivery charge added. Orders at or above the threshold ship free."""
    if 0 < goods_subtotal < FREE_DELIVERY_THRESHOLD:
        return goods_subtotal + DELIVERY_CHARGE
    return goods_subtotal


def _format_address(addr):
    parts = [
        addr.get("house_number", ""),
        addr.get("street", ""),
        addr.get("area", ""),
        addr.get("city", ""),
        addr.get("state", ""),
        addr.get("pincode", ""),
    ]
    return ", ".join([p for p in parts if p])


@checkout_bp.route("/checkout/buy-now", methods=["POST"])
@jwt_required()
def buy_now():
    """Handles a direct Buy Now purchase for a single dog/food/service item,
    independent of the cart."""
    user = current_user()
    data = request.get_json(force=True)
    item_type = data.get("item_type")

    if item_type in ("dog", "food"):
        address = data.get("address", {})
        try:
            validate_delivery_address(address)
            payment_reference = validate_payment(
                data.get("payment_method"), data.get("payment_details")
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        price = float(data["price"])
        quantity = int(data.get("quantity", 1))
        goods_subtotal = price * quantity
        total = _apply_delivery_charge(goods_subtotal)

        order = Order(
            order_id=generate_order_id(),
            user_id=user.id,
            total_amount=total,
            delivery_address=_format_address(address),
            payment_method=data.get("payment_method"),
            payment_reference=payment_reference,
            status="Pending",
        )
        db.session.add(order)
        db.session.flush()

        db.session.add(
            OrderItem(
                order_id=order.id,
                item_type=item_type,
                item_id=data["item_id"],
                quantity=quantity,
                selected_age=data.get("selected_age"),
                selected_weight=data.get("selected_weight"),
                price=price,
                details=data.get("details", {}),
            )
        )
        db.session.commit()
        return jsonify({"message": "Order placed successfully.", "order": order.to_dict()}), 201

    elif item_type == "service":
        booking = Booking(
            booking_id=generate_booking_id(),
            user_id=user.id,
            service_id=data["service_id"],
            package_id=data["package_id"],
            booking_date=data.get("date"),
            booking_time=data.get("time"),
            price=data["price"],
            status="Pending",
        )
        db.session.add(booking)
        db.session.commit()
        return jsonify(
            {"message": "Booking confirmed successfully.", "booking": booking.to_dict()}
        ), 201

    return jsonify({"error": "item_type must be dog, food, or service."}), 400


@checkout_bp.route("/checkout/cart", methods=["POST"])
@jwt_required()
def checkout_cart():
    """Checks out everything currently in the customer's cart."""
    user = current_user()
    data = request.get_json(force=True)
    address = data.get("address", {})

    cart = Cart.query.filter_by(user_id=user.id).first()
    if not cart or not cart.items:
        return jsonify({"error": "Your cart is empty."}), 400

    dog_food_items = [i for i in cart.items if i.item_type in ("dog", "food")]
    service_items = [i for i in cart.items if i.item_type == "service"]

    results = {"order": None, "bookings": []}

    if dog_food_items:
        try:
            validate_delivery_address(address)
            payment_reference = validate_payment(
                data.get("payment_method"), data.get("payment_details")
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        total = sum(float(i.price) * i.quantity for i in dog_food_items)
        total = _apply_delivery_charge(total)
        order = Order(
            order_id=generate_order_id(),
            user_id=user.id,
            total_amount=total,
            delivery_address=_format_address(address),
            payment_method=data.get("payment_method"),
            payment_reference=payment_reference,
            status="Pending",
        )
        db.session.add(order)
        db.session.flush()

        for i in dog_food_items:
            details = i.details or {}
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    item_type=i.item_type,
                    item_id=i.item_id,
                    quantity=i.quantity,
                    selected_age=details.get("age_months"),
                    selected_weight=details.get("weight_kg"),
                    price=i.price,
                    details=details,
                )
            )
            db.session.delete(i)
        db.session.flush()
        results["order"] = order.to_dict()

    for i in service_items:
        booking = Booking(
            booking_id=generate_booking_id(),
            user_id=user.id,
            service_id=i.item_id,
            package_id=i.variant_id,
            booking_date=i.selected_date,
            booking_time=i.selected_time,
            price=i.price,
            status="Pending",
        )
        db.session.add(booking)
        db.session.delete(i)
        db.session.flush()
        results["bookings"].append(booking.to_dict())

    db.session.commit()
    return jsonify({"message": "Checkout complete.", "result": results}), 201
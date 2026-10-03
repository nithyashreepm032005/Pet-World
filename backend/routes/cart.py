from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from extensions import db
from models import Cart, CartItem
from routes import current_user

cart_bp = Blueprint("cart", __name__)

FREE_DELIVERY_THRESHOLD = 1000
DELIVERY_CHARGE = 100


def _get_or_create_cart(user):
    cart = Cart.query.filter_by(user_id=user.id).first()
    if not cart:
        cart = Cart(user_id=user.id)
        db.session.add(cart)
        db.session.commit()
    return cart


@cart_bp.route("/cart", methods=["GET"])
@jwt_required()
def get_cart():
    user = current_user()
    cart = _get_or_create_cart(user)
    items = [i.to_dict() for i in cart.items]

    # Delivery charge only applies to physical goods (dogs/food), not service bookings.
    goods_subtotal = sum(
        i["line_total"] for i in items if i["item_type"] in ("dog", "food")
    )
    services_subtotal = sum(
        i["line_total"] for i in items if i["item_type"] == "service"
    )
    delivery_charge = (
        DELIVERY_CHARGE if 0 < goods_subtotal < FREE_DELIVERY_THRESHOLD else 0
    )
    total = goods_subtotal + services_subtotal + delivery_charge

    return jsonify({
        "items": items,
        "goods_subtotal": goods_subtotal,
        "services_subtotal": services_subtotal,
        "delivery_charge": delivery_charge,
        "free_delivery_threshold": FREE_DELIVERY_THRESHOLD,
        "total": total,
    }), 200


@cart_bp.route("/cart/add", methods=["POST"])
@jwt_required()
def add_to_cart():
    user = current_user()
    cart = _get_or_create_cart(user)
    data = request.get_json(force=True)

    item_type = data.get("item_type")
    if item_type not in ("dog", "food", "service"):
        return jsonify({"error": "item_type must be dog, food, or service."}), 400

    item = CartItem(
        cart_id=cart.id,
        item_type=item_type,
        item_id=data["item_id"],
        variant_id=data.get("variant_id"),
        quantity=data.get("quantity", 1),
        selected_date=data.get("selected_date"),
        selected_time=data.get("selected_time"),
        price=data["price"],
        details=data.get("details", {}),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@cart_bp.route("/cart/<int:item_id>", methods=["PUT"])
@jwt_required()
def update_cart_item(item_id):
    user = current_user()
    cart = _get_or_create_cart(user)
    item = CartItem.query.filter_by(id=item_id, cart_id=cart.id).first_or_404()
    data = request.get_json(force=True)
    if "quantity" in data:
        item.quantity = max(1, int(data["quantity"]))
    db.session.commit()
    return jsonify(item.to_dict()), 200


@cart_bp.route("/cart/<int:item_id>", methods=["DELETE"])
@jwt_required()
def remove_cart_item(item_id):
    user = current_user()
    cart = _get_or_create_cart(user)
    item = CartItem.query.filter_by(id=item_id, cart_id=cart.id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Item removed from cart."}), 200

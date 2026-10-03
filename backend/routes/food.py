from flask import Blueprint, request, jsonify
from extensions import db
from models import FoodProduct, FoodVariant
from routes import admin_required

food_bp = Blueprint("food", __name__)


@food_bp.route("/food", methods=["GET"])
def list_food():
    products = FoodProduct.query.all()
    return jsonify([p.to_dict() for p in products]), 200


@food_bp.route("/food/<int:food_id>", methods=["GET"])
def get_food(food_id):
    product = FoodProduct.query.get_or_404(food_id)
    return jsonify(product.to_dict()), 200


# ---------------- Admin food management ----------------

@food_bp.route("/admin/food", methods=["POST"])
@admin_required
def admin_add_food():
    data = request.get_json(force=True)
    product = FoodProduct(
        brand=data.get("brand", "MBN"),
        product_name=data["product_name"],
        category=data.get("category", ""),
        description=data.get("description", ""),
        image=data.get("image", ""),
    )
    db.session.add(product)
    db.session.flush()

    for v in data.get("variants", []):
        db.session.add(
            FoodVariant(
                food_id=product.id,
                weight_kg=v["weight_kg"],
                price=v["price"],
                stock=v.get("stock", 100),
            )
        )
    db.session.commit()
    return jsonify(product.to_dict()), 201


@food_bp.route("/admin/food/<int:food_id>", methods=["PUT"])
@admin_required
def admin_edit_food(food_id):
    product = FoodProduct.query.get_or_404(food_id)
    data = request.get_json(force=True)
    for field in ["brand", "product_name", "category", "description", "image"]:
        if field in data:
            setattr(product, field, data[field])
    db.session.commit()
    return jsonify(product.to_dict()), 200


@food_bp.route("/admin/food/<int:food_id>", methods=["DELETE"])
@admin_required
def admin_delete_food(food_id):
    product = FoodProduct.query.get_or_404(food_id)
    db.session.delete(product)
    db.session.commit()
    return jsonify({"message": "Food product deleted."}), 200


@food_bp.route("/admin/food/<int:food_id>/variants", methods=["POST"])
@admin_required
def admin_add_food_variant(food_id):
    FoodProduct.query.get_or_404(food_id)
    data = request.get_json(force=True)
    variant = FoodVariant(
        food_id=food_id,
        weight_kg=data["weight_kg"],
        price=data["price"],
        stock=data.get("stock", 100),
    )
    db.session.add(variant)
    db.session.commit()
    return jsonify(variant.to_dict()), 201


@food_bp.route("/admin/food-variants/<int:variant_id>", methods=["PUT"])
@admin_required
def admin_edit_food_variant(variant_id):
    variant = FoodVariant.query.get_or_404(variant_id)
    data = request.get_json(force=True)
    for field in ["weight_kg", "price", "stock"]:
        if field in data:
            setattr(variant, field, data[field])
    db.session.commit()
    return jsonify(variant.to_dict()), 200


@food_bp.route("/admin/food-variants/<int:variant_id>", methods=["DELETE"])
@admin_required
def admin_delete_food_variant(variant_id):
    variant = FoodVariant.query.get_or_404(variant_id)
    db.session.delete(variant)
    db.session.commit()
    return jsonify({"message": "Variant deleted."}), 200

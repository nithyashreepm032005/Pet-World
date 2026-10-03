from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from extensions import db
from models import Favourite, DogBreed, FoodProduct, Service
from routes import current_user

favourites_bp = Blueprint("favourites", __name__)


def _enrich(fav):
    data = fav.to_dict()
    if fav.item_type == "dog":
        item = DogBreed.query.get(fav.item_id)
        data["item"] = item.to_dict() if item else None
    elif fav.item_type == "food":
        item = FoodProduct.query.get(fav.item_id)
        data["item"] = item.to_dict() if item else None
    elif fav.item_type == "service":
        item = Service.query.get(fav.item_id)
        data["item"] = item.to_dict() if item else None
    return data


@favourites_bp.route("/favourites", methods=["GET"])
@jwt_required()
def list_favourites():
    user = current_user()
    favs = Favourite.query.filter_by(user_id=user.id).all()
    return jsonify([_enrich(f) for f in favs]), 200


@favourites_bp.route("/favourites", methods=["POST"])
@jwt_required()
def add_favourite():
    user = current_user()
    data = request.get_json(force=True)
    item_type = data.get("item_type")
    item_id = data.get("item_id")

    if item_type not in ("dog", "food", "service") or not item_id:
        return jsonify({"error": "item_type and item_id are required."}), 400

    existing = Favourite.query.filter_by(
        user_id=user.id, item_type=item_type, item_id=item_id
    ).first()
    if existing:
        return jsonify(_enrich(existing)), 200

    fav = Favourite(user_id=user.id, item_type=item_type, item_id=item_id)
    db.session.add(fav)
    db.session.commit()
    return jsonify(_enrich(fav)), 201


@favourites_bp.route("/favourites/<int:fav_id>", methods=["DELETE"])
@jwt_required()
def remove_favourite(fav_id):
    user = current_user()
    fav = Favourite.query.filter_by(id=fav_id, user_id=user.id).first_or_404()
    db.session.delete(fav)
    db.session.commit()
    return jsonify({"message": "Removed from favourites."}), 200

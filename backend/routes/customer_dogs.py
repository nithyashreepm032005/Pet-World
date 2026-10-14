from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from extensions import db
from customer_dog_models import CustomerDog
from routes import current_user

customer_dogs_bp = Blueprint("customer_dogs", __name__)


@customer_dogs_bp.route("/my-dogs", methods=["GET"])
@jwt_required()
def list_my_dogs():
    user = current_user()
    # Scoped strictly to the logged-in customer - this is what keeps one
    # customer's pets invisible to every other customer.
    dogs = CustomerDog.query.filter_by(user_id=user.id).order_by(CustomerDog.id.desc()).all()
    return jsonify([d.to_dict() for d in dogs]), 200


@customer_dogs_bp.route("/my-dogs", methods=["POST"])
@jwt_required()
def add_my_dog():
    user = current_user()
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"error": "Please enter your dog's name."}), 400

    dog = CustomerDog(
        user_id=user.id,
        name=name,
        breed=(data.get("breed") or "").strip(),
        notes=(data.get("notes") or "").strip(),
    )
    db.session.add(dog)
    db.session.commit()
    return jsonify(dog.to_dict()), 201


@customer_dogs_bp.route("/my-dogs/<int:dog_id>", methods=["PUT"])
@jwt_required()
def update_my_dog(dog_id):
    user = current_user()
    dog = CustomerDog.query.filter_by(id=dog_id, user_id=user.id).first_or_404()
    data = request.get_json(force=True) or {}

    if "name" in data:
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "Name cannot be empty."}), 400
        dog.name = name
    if "breed" in data:
        dog.breed = data["breed"].strip()
    if "notes" in data:
        dog.notes = data["notes"].strip()

    db.session.commit()
    return jsonify(dog.to_dict()), 200


@customer_dogs_bp.route("/my-dogs/<int:dog_id>", methods=["DELETE"])
@jwt_required()
def delete_my_dog(dog_id):
    user = current_user()
    dog = CustomerDog.query.filter_by(id=dog_id, user_id=user.id).first_or_404()
    db.session.delete(dog)
    db.session.commit()
    return jsonify({"message": "Removed."}), 200

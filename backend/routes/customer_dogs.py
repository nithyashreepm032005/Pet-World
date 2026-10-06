from datetime import datetime

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

from extensions import db
from customer_dog_models import CustomerDog
from routes import current_user

customer_dogs_bp = Blueprint("customer_dogs", __name__)


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("Dates must be in YYYY-MM-DD format.")


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

    try:
        vaccination_date = _parse_date(data.get("vaccination_date"))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    interval_days = int(data.get("interval_days") or current_app.config["VACCINATION_INTERVAL_DAYS"])
    next_date = CustomerDog.compute_next_date(vaccination_date, interval_days)

    dog = CustomerDog(
        user_id=user.id,
        name=name,
        breed=(data.get("breed") or "").strip(),
        vaccination_date=vaccination_date,
        next_vaccination_date=next_date,
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

    if "vaccination_date" in data:
        try:
            dog.vaccination_date = _parse_date(data.get("vaccination_date"))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        interval_days = int(data.get("interval_days") or current_app.config["VACCINATION_INTERVAL_DAYS"])
        dog.next_vaccination_date = CustomerDog.compute_next_date(dog.vaccination_date, interval_days)

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
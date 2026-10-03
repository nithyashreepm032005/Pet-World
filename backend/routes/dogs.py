from flask import Blueprint, request, jsonify
from extensions import db
from models import DogBreed, DogVariant
from routes import admin_required

dogs_bp = Blueprint("dogs", __name__)


@dogs_bp.route("/dogs", methods=["GET"])
def list_dogs():
    breeds = DogBreed.query.all()
    return jsonify([b.to_dict() for b in breeds]), 200


@dogs_bp.route("/dogs/<int:breed_id>", methods=["GET"])
def get_dog(breed_id):
    breed = DogBreed.query.get_or_404(breed_id)
    return jsonify(breed.to_dict()), 200


# ---------------- Admin dog management ----------------

@dogs_bp.route("/admin/dogs", methods=["POST"])
@admin_required
def admin_add_breed():
    data = request.get_json(force=True)
    breed = DogBreed(
        breed_name=data["breed_name"],
        image=data.get("image", ""),
        gender=data.get("gender", ""),
        color=data.get("color", ""),
        vaccination_status=data.get("vaccination_status", ""),
        health_information=data.get("health_information", ""),
        availability=data.get("availability", True),
    )
    db.session.add(breed)
    db.session.flush()

    for v in data.get("variants", []):
        db.session.add(
            DogVariant(
                breed_id=breed.id,
                age_months=v["age_months"],
                price=v["price"],
                availability=v.get("availability", True),
            )
        )
    db.session.commit()
    return jsonify(breed.to_dict()), 201


@dogs_bp.route("/admin/dogs/<int:breed_id>", methods=["PUT"])
@admin_required
def admin_edit_breed(breed_id):
    breed = DogBreed.query.get_or_404(breed_id)
    data = request.get_json(force=True)
    for field in ["breed_name", "image", "gender", "color",
                  "vaccination_status", "health_information", "availability"]:
        if field in data:
            setattr(breed, field, data[field])
    db.session.commit()
    return jsonify(breed.to_dict()), 200


@dogs_bp.route("/admin/dogs/<int:breed_id>", methods=["DELETE"])
@admin_required
def admin_delete_breed(breed_id):
    breed = DogBreed.query.get_or_404(breed_id)
    db.session.delete(breed)
    db.session.commit()
    return jsonify({"message": "Breed deleted."}), 200


@dogs_bp.route("/admin/dogs/<int:breed_id>/variants", methods=["POST"])
@admin_required
def admin_add_variant(breed_id):
    DogBreed.query.get_or_404(breed_id)
    data = request.get_json(force=True)
    variant = DogVariant(
        breed_id=breed_id,
        age_months=data["age_months"],
        price=data["price"],
        availability=data.get("availability", True),
    )
    db.session.add(variant)
    db.session.commit()
    return jsonify(variant.to_dict()), 201


@dogs_bp.route("/admin/dog-variants/<int:variant_id>", methods=["PUT"])
@admin_required
def admin_edit_variant(variant_id):
    variant = DogVariant.query.get_or_404(variant_id)
    data = request.get_json(force=True)
    for field in ["age_months", "price", "availability"]:
        if field in data:
            setattr(variant, field, data[field])
    db.session.commit()
    return jsonify(variant.to_dict()), 200


@dogs_bp.route("/admin/dog-variants/<int:variant_id>", methods=["DELETE"])
@admin_required
def admin_delete_variant(variant_id):
    variant = DogVariant.query.get_or_404(variant_id)
    db.session.delete(variant)
    db.session.commit()
    return jsonify({"message": "Variant deleted."}), 200

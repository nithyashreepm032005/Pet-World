from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from extensions import db
from routes import current_user

account_bp = Blueprint("account", __name__)


@account_bp.route("/account", methods=["GET"])
@jwt_required()
def get_account():
    user = current_user()
    return jsonify(user.to_dict()), 200


@account_bp.route("/account", methods=["PUT"])
@jwt_required()
def update_account():
    user = current_user()
    data = request.get_json(force=True)
    for field in ["full_name", "phone", "address"]:
        if field in data and data[field]:
            setattr(user, field, data[field])
    db.session.commit()
    return jsonify(user.to_dict()), 200

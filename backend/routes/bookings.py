from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from models import Booking
from routes import current_user

bookings_bp = Blueprint("bookings", __name__)


@bookings_bp.route("/bookings", methods=["GET"])
@jwt_required()
def list_bookings():
    user = current_user()
    bookings = Booking.query.filter_by(user_id=user.id).order_by(Booking.id.desc()).all()
    return jsonify([b.to_dict() for b in bookings]), 200

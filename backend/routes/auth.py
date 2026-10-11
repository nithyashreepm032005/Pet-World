import re
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token
from extensions import db, bcrypt
from models import User
from utils import is_valid_password, EMAIL_PATTERN

auth_bp = Blueprint("auth", __name__)

# The customer chooses their own User ID at registration.
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,20}$")


def _normalize_phone(phone):
    """Strip spaces/dashes and an optional +91/91 country code."""
    phone = re.sub(r"[\s\-]", "", phone or "")
    if phone.startswith("+91"):
        phone = phone[3:]
    elif phone.startswith("91") and len(phone) == 12:
        phone = phone[2:]
    return phone


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()
    # The customer creates their own User ID - no auto-generation, no email.
    user_id = (data.get("user_id") or "").strip().upper()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not all([full_name, email, phone, address, user_id, password, confirm_password]):
        return jsonify({"error": "All fields are required."}), 400

    if not USER_ID_PATTERN.match(user_id):
        return jsonify(
            {"error": "User ID must be 4-20 characters and may only contain "
                      "letters, numbers, '-' and '_'."}
        ), 400

    if not EMAIL_PATTERN.match(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    if not re.match(r"^\d{10}$", _normalize_phone(phone)):
        return jsonify({"error": "Please enter a valid 10-digit phone number."}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    if not is_valid_password(password):
        return jsonify(
            {"error": f"Password must be exactly {current_app.config['PASSWORD_LENGTH']} characters."}
        ), 400

    # Duplicate User IDs cannot be registered (also enforced by the DB's
    # unique constraint on users.user_id).
    if User.query.filter_by(user_id=user_id).first():
        return jsonify({"error": "This User ID is already taken. Please choose another."}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    user = User(
        user_id=user_id,
        full_name=full_name,
        email=email,
        phone=phone,
        address=address,
        password_hash=password_hash,
        role="customer",
    )
    db.session.add(user)
    db.session.commit()

    # No User ID email is sent. The customer logs in with the User ID they
    # just created and the password they set.
    return jsonify({
        "message": "Registration successful. Please login using your User ID and password.",
        "user_id": user.user_id,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    user_id = (data.get("user_id") or "").strip().upper()
    password = data.get("password") or ""

    user = User.query.filter_by(user_id=user_id).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid User ID or password."}), 401

    token = create_access_token(
        identity=str(user.id), additional_claims={"role": user.role}
    )
    return jsonify({"token": token, "user": user.to_dict()}), 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    # JWTs are stateless; logout is handled client-side by discarding the token.
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    # The old email + reset-token flow has been removed. The customer now
    # resets the password directly from the Reset Password page using their
    # User ID, so there is nothing to send by email.
    return jsonify(
        {"error": "Please use the Reset Password page with your User ID."}
    ), 410


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(force=True)
    user_id = (data.get("user_id") or "").strip().upper()
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not user_id:
        return jsonify({"error": "Please enter your User ID."}), 400

    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"error": "User ID not found. Please check your User ID."}), 404

    if not new_password:
        return jsonify({"error": "Please enter a new password."}), 400

    if not confirm_password:
        return jsonify({"error": "Please confirm your new password."}), 400

    if new_password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    if not is_valid_password(new_password):
        return jsonify(
            {"error": f"Password must be exactly {current_app.config['PASSWORD_LENGTH']} characters."}
        ), 400

    try:
        # Same bcrypt hashing used at registration - never store plain text.
        user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not reset the password. Please try again."}), 500

    return jsonify(
        {"message": "Password reset successfully. Please login with your new password."}
    ), 200
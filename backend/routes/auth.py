from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token
from extensions import db, bcrypt
from models import User, PasswordResetToken
from utils import generate_user_id, generate_reset_token, is_valid_password, send_email

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not all([full_name, email, phone, address, password, confirm_password]):
        return jsonify({"error": "All fields are required."}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    if not is_valid_password(password):
        return jsonify(
            {"error": f"Password must be exactly {current_app.config['PASSWORD_LENGTH']} characters."}
        ), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists."}), 409

    # Ensure the generated User ID is unique
    while True:
        user_id = generate_user_id()
        if not User.query.filter_by(user_id=user_id).first():
            break

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

    email_sent = send_email(
        email,
        "Welcome to PetWorld - Your User ID",
        f"Hello {full_name},\n\nThank you for registering with PetWorld!\n"
        f"Your User ID is: {user_id}\n\n"
        f"Please use this User ID along with your password to log in.\n\n"
        f"For your security, we never include your password in this or any email.",
    )

    # The User ID is sent by email, NOT returned here as the primary way to
    # get it - this intentionally avoids showing it directly on the register
    # page. If email delivery failed, we still tell the customer plainly so
    # they can use "Resend User ID" to recover it instead of being stuck.
    if email_sent:
        return jsonify({
            "message": "Registration successful! Your User ID has been sent to your registered email address.",
            "email_sent": True,
        }), 201
    else:
        return jsonify({
            "message": "Registration successful, but we could not send the confirmation email right now. "
                       "You can retrieve your User ID any time using 'Resend User ID' on the login page.",
            "email_sent": False,
        }), 201


@auth_bp.route("/resend-user-id", methods=["POST"])
def resend_user_id():
    """Lets a customer recover their User ID by email if they lost the
    original registration email (or it failed to send)."""
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()

    user = User.query.filter_by(email=email, role="customer").first()
    generic_message = "If that email is registered, your User ID has been sent to it."

    if not user:
        # Do not reveal whether the email exists, for security.
        return jsonify({"message": generic_message}), 200

    send_email(
        user.email,
        "PetWorld - Your User ID",
        f"Hello {user.full_name},\n\nAs requested, here is your PetWorld User ID: {user.user_id}\n\n"
        f"Use it along with your password to log in. If you didn't request this, you can ignore this email.",
    )
    return jsonify({"message": generic_message}), 200


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
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()

    user = User.query.filter_by(email=email).first()
    if not user:
        # Do not reveal whether the email exists, for security.
        return jsonify(
            {"message": "If that email is registered, a reset link has been sent."}
        ), 200

    token = generate_reset_token()
    reset = PasswordResetToken(
        user_id=user.id,
        token=token,
        expiry=datetime.utcnow() + timedelta(minutes=30),
        used=False,
    )
    db.session.add(reset)
    db.session.commit()

    send_email(
        user.email,
        "PetWorld Password Reset",
        f"Hello {user.full_name},\n\nUse this token to reset your password: {token}\n"
        f"This token expires in 30 minutes.",
    )

    return jsonify(
        {"message": "If that email is registered, a reset link has been sent."}
    ), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(force=True)
    token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    if new_password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    if not is_valid_password(new_password):
        return jsonify(
            {"error": f"Password must be exactly {current_app.config['PASSWORD_LENGTH']} characters."}
        ), 400

    reset = PasswordResetToken.query.filter_by(token=token, used=False).first()
    if not reset or reset.expiry < datetime.utcnow():
        return jsonify({"error": "Invalid or expired reset token."}), 400

    user = User.query.get(reset.user_id)
    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    reset.used = True
    db.session.commit()

    return jsonify({"message": "Password reset successful. Please log in."}), 200
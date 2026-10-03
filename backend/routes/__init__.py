from functools import wraps
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity
from models import User


def current_user():
    """Return the User object for the current JWT identity, or None."""
    user_id = get_jwt_identity()
    if not user_id:
        return None
    return User.query.get(int(user_id))


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if claims.get("role") != "admin":
            return jsonify({"error": "Admin access required."}), 403
        return fn(*args, **kwargs)

    return wrapper

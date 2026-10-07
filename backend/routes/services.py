import os
import re
import time
from pathlib import Path

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from extensions import db
from models import Service, ServicePackage
from routes import admin_required

services_bp = Blueprint("services", __name__)

# Uploaded service images are stored in frontend/images/services/ and served
# by the frontend static server, so the DB stores a plain web-relative path
# like "images/services/service_1_1712345678_grooming.jpg".
SERVICE_IMAGES_DIR = Path(__file__).resolve().parents[2] / "frontend" / "images" / "services"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _clean_image_path(value):
    """Keep only a web path/URL - never an absolute filesystem path."""
    value = (value or "").strip()
    if not value:
        return ""
    if re.match(r"^[A-Za-z]:[\\/]", value) or value.startswith("\\\\"):
        # Absolute Windows/UNC path pasted by mistake: keep just the filename
        # so no filesystem layout is exposed to the frontend.
        value = os.path.basename(value.replace("\\", "/"))
    value = value.lstrip("/")
    while value.startswith("./"):
        value = value[2:]
    return value


@services_bp.route("/services", methods=["GET"])
def list_services():
    services = Service.query.all()
    return jsonify([s.to_dict() for s in services]), 200


@services_bp.route("/services/<int:service_id>", methods=["GET"])
def get_service(service_id):
    service = Service.query.get_or_404(service_id)
    return jsonify(service.to_dict()), 200


# ---------------- Admin service management ----------------

@services_bp.route("/admin/services", methods=["POST"])
@admin_required
def admin_add_service():
    data = request.get_json(force=True)
    service = Service(
        service_name=data["service_name"],
        description=data.get("description", ""),
        image=_clean_image_path(data.get("image", "")),
        availability=data.get("availability", True),
    )
    db.session.add(service)
    db.session.flush()

    for p in data.get("packages", []):
        db.session.add(
            ServicePackage(
                service_id=service.id,
                package_name=p["package_name"],
                duration=p.get("duration", ""),
                price=p["price"],
                availability=p.get("availability", True),
            )
        )
    db.session.commit()
    return jsonify(service.to_dict()), 201


@services_bp.route("/admin/services/<int:service_id>", methods=["PUT"])
@admin_required
def admin_edit_service(service_id):
    service = Service.query.get_or_404(service_id)
    data = request.get_json(force=True)
    for field in ["service_name", "description", "image", "availability"]:
        if field in data:
            setattr(service, field, _clean_image_path(data[field]) if field == "image" else data[field])
    db.session.commit()
    return jsonify(service.to_dict()), 200


@services_bp.route("/admin/services/<int:service_id>/image", methods=["POST"])
@admin_required
def admin_upload_service_image(service_id):
    """Upload a new image file for a service. Saves it under
    frontend/images/services/ and stores the web path in the database, so the
    customer services page picks the new image up automatically."""
    service = Service.query.get_or_404(service_id)

    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "No image file selected."}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "Unsupported image format. Use JPG, PNG, GIF, WEBP or SVG."}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size == 0:
        return jsonify({"error": "The selected image file is empty."}), 400
    if size > MAX_IMAGE_BYTES:
        return jsonify({"error": "Image is too large. Maximum size is 5 MB."}), 400

    SERVICE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = secure_filename(file.filename) or f"service{ext}"
    if not safe_name.lower().endswith(ext):
        safe_name = f"{os.path.splitext(safe_name)[0]}{ext}"
    filename = f"service_{service.id}_{int(time.time())}_{safe_name}"
    file.save(SERVICE_IMAGES_DIR / filename)

    service.image = f"images/services/{filename}"
    db.session.commit()
    return jsonify(service.to_dict()), 200


@services_bp.route("/admin/services/<int:service_id>", methods=["DELETE"])
@admin_required
def admin_delete_service(service_id):
    service = Service.query.get_or_404(service_id)
    db.session.delete(service)
    db.session.commit()
    return jsonify({"message": "Service deleted."}), 200


@services_bp.route("/admin/services/<int:service_id>/packages", methods=["POST"])
@admin_required
def admin_add_package(service_id):
    Service.query.get_or_404(service_id)
    data = request.get_json(force=True)
    package = ServicePackage(
        service_id=service_id,
        package_name=data["package_name"],
        duration=data.get("duration", ""),
        price=data["price"],
        availability=data.get("availability", True),
    )
    db.session.add(package)
    db.session.commit()
    return jsonify(package.to_dict()), 201


@services_bp.route("/admin/service-packages/<int:package_id>", methods=["PUT"])
@admin_required
def admin_edit_package(package_id):
    package = ServicePackage.query.get_or_404(package_id)
    data = request.get_json(force=True)
    for field in ["package_name", "duration", "price", "availability"]:
        if field in data:
            setattr(package, field, data[field])
    db.session.commit()
    return jsonify(package.to_dict()), 200


@services_bp.route("/admin/service-packages/<int:package_id>", methods=["DELETE"])
@admin_required
def admin_delete_package(package_id):
    package = ServicePackage.query.get_or_404(package_id)
    db.session.delete(package)
    db.session.commit()
    return jsonify({"message": "Package deleted."}), 200

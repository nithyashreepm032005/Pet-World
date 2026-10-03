from flask import Blueprint, request, jsonify
from extensions import db
from models import Service, ServicePackage
from routes import admin_required

services_bp = Blueprint("services", __name__)


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
        image=data.get("image", ""),
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
            setattr(service, field, data[field])
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

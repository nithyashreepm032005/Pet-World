from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify
from config import Config
from extensions import db, bcrypt, jwt, cors


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    # Register blueprints
    from routes.auth import auth_bp
    from routes.dogs import dogs_bp
    from routes.food import food_bp
    from routes.services import services_bp
    from routes.favourites import favourites_bp
    from routes.cart import cart_bp
    from routes.checkout import checkout_bp
    from routes.orders import orders_bp
    from routes.bookings import bookings_bp
    from routes.account import account_bp
    from routes.admin import admin_bp
    import service_models  # noqa: F401  (registers the Services-feature tables)
    import return_models   # noqa: F401  (registers the return_requests table)
    from routes.service_bookings import service_bp, employee_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(dogs_bp, url_prefix="/api")
    app.register_blueprint(food_bp, url_prefix="/api")
    app.register_blueprint(services_bp, url_prefix="/api")
    app.register_blueprint(favourites_bp, url_prefix="/api")
    app.register_blueprint(cart_bp, url_prefix="/api")
    app.register_blueprint(checkout_bp, url_prefix="/api")
    app.register_blueprint(orders_bp, url_prefix="/api")
    app.register_blueprint(bookings_bp, url_prefix="/api")
    app.register_blueprint(account_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(service_bp, url_prefix="/api")
    app.register_blueprint(employee_bp, url_prefix="/api")

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "PetWorld API is running."}), 200

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error."}), 500

    return app


app = create_app()

with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True, port=5000)

import os
from urllib.parse import quote_plus
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    # ---- MySQL connection ----
    # Update these four values (or set them as environment variables)
    # to match your local MySQL installation before running the app.
    MYSQL_USER = os.environ.get("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "password")
    MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
    MYSQL_DB = os.environ.get("MYSQL_DB", "petworld")

    # quote_plus safely encodes special characters (@, #, %, etc.) that
    # might appear in a MySQL password, so the connection URL is built
    # correctly no matter what the password contains.
    _encoded_password = quote_plus(MYSQL_PASSWORD)

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{MYSQL_USER}:{_encoded_password}@{MYSQL_HOST}/{MYSQL_DB}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ---- Security ----
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-secret-key")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)

    # ---- Email (used to send generated User IDs / reset links) ----
    # If left blank, emails are just printed to the Flask console instead
    # of actually being sent - handy for local development/testing.
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))

    PASSWORD_LENGTH = 8
    CORS_ORIGINS = "*"
    # ---- Vaccination scheduling ----
    # Generic, configurable gap (in days) used to suggest a dog's next
    # vaccination date. This is a placeholder default, NOT medical advice -
    # change it to match your vet's actual guidance, or let it be
    # overridden per-dog from the "My Dogs" page.
    VACCINATION_INTERVAL_DAYS = int(os.environ.get("VACCINATION_INTERVAL_DAYS", 365))

    # ---- Store location (shown to customers for Store Service bookings) ----
    STORE_ADDRESS = "28, Bugle Rock Park, Basavanagudi, Bengaluru"
    STORE_LATITUDE = 12.9423
    STORE_LONGITUDE = 77.5760
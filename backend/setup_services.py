"""
One-time setup for the Services feature.

Creates the tables  employees, service_bookings, employee_locations
and two demo employees (one male, one female).

Run from the backend folder (with venv active):
    python setup_services.py

It is safe to run more than once.
"""
import models            # noqa: F401  - existing tables (users, services ...)
import service_models    # noqa: F401  - new tables
from app import create_app
from extensions import db, bcrypt
from service_models import Employee

DEMO_EMPLOYEES = [
    # name,          phone,        email,                 gender,   password (8 chars)
    ("Ravi Kumar",   "9880011111", "ravi@petworld.com",   "Male",   "Emp@1234"),
    ("Priya Sharma", "9880022222", "priya@petworld.com",  "Female", "Emp@1234"),
]

app = create_app()

with app.app_context():
    db.create_all()   # only creates tables that do not exist yet
    print("Tables ready: employees, service_bookings, employee_locations")

    for name, phone, email, gender, password in DEMO_EMPLOYEES:
        if Employee.query.filter_by(email=email).first():
            print(f"Employee already exists: {email}")
            continue
        db.session.add(Employee(
            name=name, phone=phone, email=email, gender=gender,
            password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
        ))
        print(f"Created employee: {name} ({gender}) -> {email} / {password}")

    db.session.commit()
    print("Services setup complete.")

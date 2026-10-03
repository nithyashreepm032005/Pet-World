"""
Database tables for the Services feature:
  - employees
  - service_bookings
  - employee_locations
"""
from datetime import datetime
from extensions import db


class Employee(db.Model):
    __tablename__ = "employees"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120), unique=True, nullable=False)
    gender = db.Column(db.String(10), nullable=False)          # Male / Female
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class ServiceBooking(db.Model):
    __tablename__ = "service_bookings"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.String(20), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    service_name = db.Column(db.String(100), nullable=False)
    service_mode = db.Column(db.String(10), nullable=False)    # store / home
    booking_date = db.Column(db.Date, nullable=False)
    booking_time = db.Column(db.Time, nullable=False)
    duration_hours = db.Column(db.Numeric(3, 1), nullable=False)
    provider_gender = db.Column(db.String(10))                 # home only
    number_of_dogs = db.Column(db.Integer, nullable=False, default=1)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    address = db.Column(db.Text)                               # home only
    latitude = db.Column(db.Numeric(10, 7))                    # home only
    longitude = db.Column(db.Numeric(10, 7))                   # home only
    payment_method = db.Column(db.String(20), default="COD")   # COD | UPI | Card
    payment_reference = db.Column(db.String(100))
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), index=True)
    booking_status = db.Column(db.String(30), nullable=False, default="Booking Confirmed")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")
    employee = db.relationship("Employee")


class EmployeeLocation(db.Model):
    """Latest known GPS position of the employee for one active home booking."""
    __tablename__ = "employee_locations"
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    booking_id = db.Column(db.Integer, db.ForeignKey("service_bookings.id"),
                           nullable=False, unique=True)
    latitude = db.Column(db.Numeric(10, 7), nullable=False)
    longitude = db.Column(db.Numeric(10, 7), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

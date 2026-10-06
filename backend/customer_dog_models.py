"""
Customer-owned pets ("My Dogs"), separate from DogBreed (the sales catalog
in models.py). This is where a customer's own dog's vaccination info lives.
"""
from datetime import datetime, timedelta
from extensions import db

# Default gap, in days, suggested between vaccinations. This is a generic,
# configurable placeholder (NOT medical advice) - adjust via
# config.py: VACCINATION_INTERVAL_DAYS. A real deployment should let the
# customer's vet determine the actual schedule per dog/vaccine.
DEFAULT_VACCINATION_INTERVAL_DAYS = 365


class CustomerDog(db.Model):
    __tablename__ = "customer_dogs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    breed = db.Column(db.String(100))
    vaccination_date = db.Column(db.Date)
    next_vaccination_date = db.Column(db.Date)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")

    def to_dict(self):
        today = datetime.utcnow().date()
        overdue = bool(self.next_vaccination_date and self.next_vaccination_date < today)
        return {
            "id": self.id,
            "name": self.name,
            "breed": self.breed,
            "vaccination_date": self.vaccination_date.isoformat() if self.vaccination_date else None,
            "next_vaccination_date": self.next_vaccination_date.isoformat() if self.next_vaccination_date else None,
            "vaccination_overdue": overdue,
            "notes": self.notes,
        }

    @staticmethod
    def compute_next_date(vaccination_date, interval_days):
        if not vaccination_date:
            return None
        return vaccination_date + timedelta(days=interval_days)
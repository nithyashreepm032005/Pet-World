"""
Customer-owned pets ("My Dogs"), separate from DogBreed (the sales catalog
in models.py). This is a private list of a customer's own dogs.
"""
from datetime import datetime
from extensions import db


class CustomerDog(db.Model):
    __tablename__ = "customer_dogs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    breed = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "breed": self.breed,
            "notes": self.notes,
        }

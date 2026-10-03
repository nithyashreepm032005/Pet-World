from datetime import datetime
from extensions import db

RETURN_STATUSES = ("Pending", "Approved", "Rejected", "Completed")


class ReturnRequest(db.Model):
    __tablename__ = "return_requests"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    request_date = db.Column(db.DateTime, default=datetime.utcnow)
    reason = db.Column(db.Text)
    status = db.Column(db.String(20), default="Pending")

    order = db.relationship("Order")
    user = db.relationship("User")

    def to_dict(self, include_order=False):
        data = {
            "id": self.id,
            "order_id": self.order_id,
            "request_date": self.request_date.isoformat(),
            "reason": self.reason,
            "status": self.status,
        }
        if include_order and self.order:
            data["order_number"] = self.order.order_id
            data["customer_name"] = self.user.full_name if self.user else None
            data["customer_user_id"] = self.user.user_id if self.user else None
        return data
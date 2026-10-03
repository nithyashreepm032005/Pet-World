from datetime import datetime
from extensions import db


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(20), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    address = db.Column(db.String(255))
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="customer")  # 'customer' or 'admin'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "address": self.address,
            "role": self.role,
        }


class DogBreed(db.Model):
    __tablename__ = "dog_breeds"
    id = db.Column(db.Integer, primary_key=True)
    breed_name = db.Column(db.String(100), nullable=False)
    image = db.Column(db.String(255))
    gender = db.Column(db.String(20))
    color = db.Column(db.String(50))
    vaccination_status = db.Column(db.String(50))
    health_information = db.Column(db.Text)
    availability = db.Column(db.Boolean, default=True)

    variants = db.relationship(
        "DogVariant", backref="breed", cascade="all, delete-orphan"
    )

    def to_dict(self, with_variants=True):
        data = {
            "id": self.id,
            "breed_name": self.breed_name,
            "image": self.image,
            "gender": self.gender,
            "color": self.color,
            "vaccination_status": self.vaccination_status,
            "health_information": self.health_information,
            "availability": self.availability,
        }
        if with_variants:
            data["variants"] = [v.to_dict() for v in self.variants]
        return data


class DogVariant(db.Model):
    __tablename__ = "dog_variants"
    id = db.Column(db.Integer, primary_key=True)
    breed_id = db.Column(db.Integer, db.ForeignKey("dog_breeds.id"), nullable=False)
    age_months = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    availability = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "breed_id": self.breed_id,
            "age_months": self.age_months,
            "price": float(self.price),
            "availability": self.availability,
        }


class FoodProduct(db.Model):
    __tablename__ = "food_products"
    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(50), default="MBN")
    product_name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50))
    description = db.Column(db.Text)
    image = db.Column(db.String(255))

    variants = db.relationship(
        "FoodVariant", backref="product", cascade="all, delete-orphan"
    )

    def to_dict(self, with_variants=True):
        data = {
            "id": self.id,
            "brand": self.brand,
            "product_name": self.product_name,
            "category": self.category,
            "description": self.description,
            "image": self.image,
        }
        if with_variants:
            data["variants"] = [v.to_dict() for v in self.variants]
        return data


class FoodVariant(db.Model):
    __tablename__ = "food_variants"
    id = db.Column(db.Integer, primary_key=True)
    food_id = db.Column(db.Integer, db.ForeignKey("food_products.id"), nullable=False)
    weight_kg = db.Column(db.Numeric(5, 2), nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    stock = db.Column(db.Integer, default=100)

    def to_dict(self):
        return {
            "id": self.id,
            "food_id": self.food_id,
            "weight_kg": float(self.weight_kg),
            "price": float(self.price),
            "stock": self.stock,
        }


class Service(db.Model):
    __tablename__ = "services"
    id = db.Column(db.Integer, primary_key=True)
    service_name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    image = db.Column(db.String(255))
    availability = db.Column(db.Boolean, default=True)

    packages = db.relationship(
        "ServicePackage", backref="service", cascade="all, delete-orphan"
    )

    def to_dict(self, with_packages=True):
        data = {
            "id": self.id,
            "service_name": self.service_name,
            "description": self.description,
            "image": self.image,
            "availability": self.availability,
        }
        if with_packages:
            data["packages"] = [p.to_dict() for p in self.packages]
        return data


class ServicePackage(db.Model):
    __tablename__ = "service_packages"
    id = db.Column(db.Integer, primary_key=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    package_name = db.Column(db.String(100), nullable=False)
    duration = db.Column(db.String(50))
    price = db.Column(db.Numeric(10, 2), nullable=False)
    availability = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "service_id": self.service_id,
            "package_name": self.package_name,
            "duration": self.duration,
            "price": float(self.price),
            "availability": self.availability,
        }


class Favourite(db.Model):
    __tablename__ = "favourites"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    item_type = db.Column(db.String(20), nullable=False)  # dog | food | service
    item_id = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "item_type": self.item_type,
            "item_id": self.item_id,
            "created_at": self.created_at.isoformat(),
        }


class Cart(db.Model):
    __tablename__ = "cart"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship(
        "CartItem", backref="cart", cascade="all, delete-orphan"
    )


class CartItem(db.Model):
    __tablename__ = "cart_items"
    id = db.Column(db.Integer, primary_key=True)
    cart_id = db.Column(db.Integer, db.ForeignKey("cart.id"), nullable=False)
    item_type = db.Column(db.String(20), nullable=False)  # dog | food | service
    item_id = db.Column(db.Integer, nullable=False)  # breed_id / food_id / service_id
    variant_id = db.Column(db.Integer)  # dog_variant_id / food_variant_id / package_id
    quantity = db.Column(db.Integer, default=1)
    selected_date = db.Column(db.String(20))
    selected_time = db.Column(db.String(20))
    price = db.Column(db.Numeric(10, 2), nullable=False)
    details = db.Column(db.JSON)  # snapshot for display (name, age/weight/package etc)

    def to_dict(self):
        return {
            "id": self.id,
            "item_type": self.item_type,
            "item_id": self.item_id,
            "variant_id": self.variant_id,
            "quantity": self.quantity,
            "selected_date": self.selected_date,
            "selected_time": self.selected_time,
            "price": float(self.price),
            "details": self.details,
            "line_total": float(self.price) * self.quantity,
        }

class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.String(30), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    delivery_address = db.Column(db.String(500))
    payment_method = db.Column(db.String(20), default="COD")  # COD | UPI | Card
    payment_reference = db.Column(db.String(100))              # mock UPI ID / masked card
    order_date = db.Column(db.DateTime, default=datetime.utcnow)
    delivered_at = db.Column(db.DateTime)                      # set when admin marks "Delivered"
    status = db.Column(db.String(20), default="Pending")

    items = db.relationship(
        "OrderItem", backref="order", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "total_amount": float(self.total_amount),
            "delivery_address": self.delivery_address,
            "payment_method": self.payment_method,
            "payment_reference": self.payment_reference,
            "order_date": self.order_date.isoformat(),
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
            "status": self.status,
            "items": [i.to_dict() for i in self.items],
        }


class OrderItem(db.Model):
    __tablename__ = "order_items"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    item_type = db.Column(db.String(20), nullable=False)
    item_id = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, default=1)
    selected_age = db.Column(db.Integer)
    selected_weight = db.Column(db.Numeric(5, 2))
    price = db.Column(db.Numeric(10, 2), nullable=False)
    details = db.Column(db.JSON)

    def to_dict(self):
        return {
            "id": self.id,
            "item_type": self.item_type,
            "item_id": self.item_id,
            "quantity": self.quantity,
            "selected_age": self.selected_age,
            "selected_weight": float(self.selected_weight) if self.selected_weight else None,
            "price": float(self.price),
            "details": self.details,
        }


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.String(30), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    package_id = db.Column(db.Integer, db.ForeignKey("service_packages.id"), nullable=False)
    booking_date = db.Column(db.String(20))
    booking_time = db.Column(db.String(20))
    price = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(20), default="Pending")

    service = db.relationship("Service")
    package = db.relationship("ServicePackage")

    def to_dict(self):
        return {
            "id": self.id,
            "booking_id": self.booking_id,
            "service": self.service.service_name if self.service else None,
            "package": self.package.package_name if self.package else None,
            "booking_date": self.booking_date,
            "booking_time": self.booking_time,
            "price": float(self.price),
            "status": self.status,
        }


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.String(100), unique=True, nullable=False)
    expiry = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)

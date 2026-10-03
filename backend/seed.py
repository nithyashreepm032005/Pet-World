"""
Run this once after creating the database tables to populate PetWorld with
the exact catalog required by the spec (10 dog breeds, 8 MBN food products,
2 service categories) plus one admin account for the Admin Dashboard.

Usage:
    python seed.py
"""
from app import create_app
from extensions import db, bcrypt
from models import (
    User, DogBreed, DogVariant, FoodProduct, FoodVariant, Service, ServicePackage
)
from utils import generate_user_id

app = create_app()

# Example age -> price structure from the master prompt (younger = pricier).
AGE_PRICE_TABLE = [
    (2, 35000),
    (3, 32000),
    (4, 29000),
    (5, 26000),
    (6, 23000),
    (12, 20000),
]

BREEDS = [
    ("Labrador Retriever", "Friendly", "Golden/Black", "Fully Vaccinated"),
    ("Golden Retriever", "Gentle", "Golden", "Fully Vaccinated"),
    ("German Shepherd", "Loyal", "Black/Tan", "Fully Vaccinated"),
    ("Beagle", "Playful", "Tricolor", "Fully Vaccinated"),
    ("Shih Tzu", "Affectionate", "White/Brown", "Fully Vaccinated"),
    ("Pomeranian", "Energetic", "Cream", "Fully Vaccinated"),
    ("Rottweiler", "Protective", "Black/Tan", "Fully Vaccinated"),
    ("Siberian Husky", "Active", "Grey/White", "Fully Vaccinated"),
    ("Pug", "Charming", "Fawn", "Fully Vaccinated"),
    ("Dachshund", "Curious", "Brown", "Fully Vaccinated"),
]

FOOD_PRODUCTS = [
    ("Premium Chicken & Rice", "Adult Dog Food", "Delicious chicken and rice recipe for everyday nutrition."),
    ("Premium Wet Dog Food", "Wet Food", "Soft, tasty wet food that dogs love."),
    ("Premium Dog Treats", "Treats", "Tasty, healthy training and reward treats."),
    ("Premium Puppy Food", "Puppy Food", "Specially formulated nutrition for growing puppies."),
    ("Premium Lamb Food", "Adult Dog Food", "Rich lamb recipe packed with protein."),
    ("Premium Beef Food", "Adult Dog Food", "Hearty beef recipe for active dogs."),
    ("Premium Salmon Food", "Adult Dog Food", "Omega-rich salmon recipe for a shiny coat."),
    ("Premium Fish & Omega", "Adult Dog Food", "Fish based recipe rich in Omega fatty acids."),
]

FOOD_WEIGHT_PRICES = [
    (1, 599),
    (2, 1099),
    (5, 2499),
    (10, 4499),
]

SERVICES = {
    "Grooming & Spa": [
        ("Basic Bath & Brush", "45 mins", 599),
        ("Full Grooming Package", "90 mins", 1299),
        ("Spa Deluxe Package", "120 mins", 1999),
    ],
    "Training & Behavioral": [
        ("Basic Obedience Training", "1 hour/session", 999),
        ("Behavioral Correction Program", "1 hour/session", 1499),
        ("Puppy Training Program", "45 mins/session", 899),
    ],
}


def seed():
    with app.app_context():
        db.create_all()

        # ---- Admin account ----
        if not User.query.filter_by(role="admin").first():
            admin = User(
                user_id="ADMIN01",
                full_name="PetWorld Admin",
                email="admin@petworld.com",
                phone="9999999999",
                address="PetWorld HQ",
                password_hash=bcrypt.generate_password_hash("Admin@01").decode("utf-8"),
                role="admin",
            )
            db.session.add(admin)
            print("Created admin account -> User ID: ADMIN01 | Password: Admin@01")

        # ---- Dog breeds ----
        if DogBreed.query.count() == 0:
            for name, gender, color, vacc in BREEDS:
                breed = DogBreed(
                    breed_name=name,
                    image=f"images/dogs/{name.lower().replace(' ', '_')}.jpg",
                    gender=gender,
                    color=color,
                    vaccination_status=vacc,
                    health_information="Healthy and vet-checked.",
                    availability=True,
                )
                db.session.add(breed)
                db.session.flush()
                for age, price in AGE_PRICE_TABLE:
                    db.session.add(
                        DogVariant(breed_id=breed.id, age_months=age, price=price, availability=True)
                    )
            print(f"Seeded {len(BREEDS)} dog breeds with age/price variants.")

        # ---- Food products ----
        if FoodProduct.query.count() == 0:
            for name, category, desc in FOOD_PRODUCTS:
                product = FoodProduct(
                    brand="MBN",
                    product_name=name,
                    category=category,
                    description=desc,
                    image=f"images/food/{name.lower().replace(' ', '_').replace('&', 'and')}.jpg",
                )
                db.session.add(product)
                db.session.flush()
                for weight, price in FOOD_WEIGHT_PRICES:
                    db.session.add(
                        FoodVariant(food_id=product.id, weight_kg=weight, price=price, stock=100)
                    )
            print(f"Seeded {len(FOOD_PRODUCTS)} MBN food products with weight/price variants.")

        # ---- Services ----
        if Service.query.count() == 0:
            for service_name, packages in SERVICES.items():
                service = Service(
                    service_name=service_name,
                    description=f"{service_name} services for your beloved pet.",
                    image=f"images/services/{service_name.lower().replace(' ', '_').replace('&', 'and')}.jpg",
                    availability=True,
                )
                db.session.add(service)
                db.session.flush()
                for pkg_name, duration, price in packages:
                    db.session.add(
                        ServicePackage(
                            service_id=service.id,
                            package_name=pkg_name,
                            duration=duration,
                            price=price,
                            availability=True,
                        )
                    )
            print(f"Seeded {len(SERVICES)} service categories with packages.")

        db.session.commit()
        print("Database seeding complete.")


if __name__ == "__main__":
    seed()

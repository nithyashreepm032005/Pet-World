"""
One-time fix: gives every dog breed and every food product its OWN pricing
instead of the same numbers being reused everywhere.

This updates prices IN PLACE (matching existing rows by age_months / weight_kg)
so it's safe to run even if you already have breeds/food seeded and orders
already placed against them - nothing gets deleted or recreated.

Run from the backend folder (venv active):
    python fix_prices.py
"""
from app import create_app
from extensions import db
from models import DogBreed, DogVariant, FoodProduct, FoodVariant

app = create_app()

# ---------------------------------------------------------------------------
# Food: exact prices per product, per weight (matches your pricing table)
# ---------------------------------------------------------------------------
FOOD_PRICES = {
    "Premium Chicken & Rice":  {1: 500, 2: 950,  5: 2200, 10: 4100},
    "Premium Wet Dog Food":    {1: 650, 2: 1200, 5: 2800, 10: 5200},
    "Premium Dog Treats":      {1: 550, 2: 1000, 5: 2300, 10: 4300},
    "Premium Puppy Food":      {1: 600, 2: 1100, 5: 2550, 10: 4800},
    "Premium Lamb Food":       {1: 750, 2: 1400, 5: 3300, 10: 6200},
    "Premium Beef Food":       {1: 700, 2: 1300, 5: 3000, 10: 5600},
    "Premium Salmon Food":     {1: 850, 2: 1600, 5: 3800, 10: 7200},
    "Premium Fish & Omega":    {1: 750, 2: 1400, 5: 3300, 10: 6200},
}

# ---------------------------------------------------------------------------
# Dogs: base price table (2mo/3mo/4mo/5mo/6mo/12mo), then a per-breed
# multiplier so bigger/rarer breeds cost more, smaller/common ones cost less.
# Feel free to tweak BREED_MULTIPLIERS to match your own pricing strategy.
# ---------------------------------------------------------------------------
BASE_AGE_PRICES = {2: 35000, 3: 32000, 4: 29000, 5: 26000, 6: 23000, 12: 20000}

BREED_MULTIPLIERS = {
    "Labrador Retriever": 1.00,
    "Golden Retriever":   1.15,
    "German Shepherd":    1.05,
    "Beagle":             0.75,
    "Shih Tzu":           0.85,
    "Pomeranian":         0.90,
    "Rottweiler":         1.20,
    "Siberian Husky":     1.30,
    "Pug":                0.80,
    "Dachshund":          0.95,
}


def round_to_hundred(value):
    return int(round(value / 100.0) * 100)


def fix_food_prices():
    updated_products = 0
    updated_variants = 0
    for product in FoodProduct.query.all():
        price_table = FOOD_PRICES.get(product.product_name)
        if not price_table:
            print(f"  (skipped - no price table defined for '{product.product_name}')")
            continue
        updated_products += 1
        for variant in product.variants:
            weight = int(variant.weight_kg)
            if weight in price_table:
                variant.price = price_table[weight]
                updated_variants += 1
    print(f"Food: updated {updated_variants} variant prices across {updated_products} products.")


def fix_dog_prices():
    updated_breeds = 0
    updated_variants = 0
    for breed in DogBreed.query.all():
        multiplier = BREED_MULTIPLIERS.get(breed.breed_name)
        if multiplier is None:
            print(f"  (skipped - no multiplier defined for '{breed.breed_name}')")
            continue
        updated_breeds += 1
        for variant in breed.variants:
            base = BASE_AGE_PRICES.get(variant.age_months)
            if base is not None:
                variant.price = round_to_hundred(base * multiplier)
                updated_variants += 1
    print(f"Dogs: updated {updated_variants} variant prices across {updated_breeds} breeds.")


if __name__ == "__main__":
    with app.app_context():
        fix_food_prices()
        fix_dog_prices()
        db.session.commit()
        print("Done! Prices updated.")
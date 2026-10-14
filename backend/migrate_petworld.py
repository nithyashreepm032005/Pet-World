"""
PetWorld - one-off (but re-runnable) schema migration.

    python migrate_petworld.py

Changes applied:
  1. users.email  -> made NULLABLE so customers can register without an email.
                     Existing emails and accounts are kept.
                     (MySQL permits unlimited NULLs in a UNIQUE column.)
  2. Removes the vaccination feature columns that are no longer used:
        dog_breeds    : vaccination_status, date_of_birth,
                        last_vaccination_date, next_vaccination_date
        customer_dogs : date_of_birth, vaccination_date, next_vaccination_date

No rows are deleted and the remaining columns are untouched. Dropping a column
only removes that column's values (e.g. the old "Fully Vaccinated" text); all
dog, customer and booking records stay exactly as they are. Running the script
twice is safe: every step checks the live schema first.
"""
from sqlalchemy import inspect, text

from app import create_app
from extensions import db


def _column(inspector, table, column):
    return next((c for c in inspector.get_columns(table) if c["name"] == column), None)


def migrate():
    app = create_app()
    with app.app_context():
        inspector = inspect(db.engine)

        statements = []

        # 1. users.email: drop NOT NULL (keeps the UNIQUE index intact).
        email_col = _column(inspector, "users", "email")
        if email_col is not None and not email_col["nullable"]:
            statements.append("ALTER TABLE users MODIFY email VARCHAR(120) NULL")

        # 2. Drop the removed vaccination columns if they still exist.
        drop_columns = {
            "dog_breeds": [
                "vaccination_status",
                "date_of_birth",
                "last_vaccination_date",
                "next_vaccination_date",
            ],
            "customer_dogs": [
                "date_of_birth",
                "vaccination_date",
                "next_vaccination_date",
            ],
        }
        for table, columns in drop_columns.items():
            for name in columns:
                if _column(inspector, table, name) is not None:
                    statements.append(f"ALTER TABLE {table} DROP COLUMN {name}")

        if not statements:
            print("No migration needed - schema is already up to date.")
            return

        with db.engine.begin() as conn:
            for stmt in statements:
                print("Running:", stmt)
                conn.execute(text(stmt))

        print(f"Migration complete ({len(statements)} change(s) applied).")


if __name__ == "__main__":
    migrate()

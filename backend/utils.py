import random
import string
import smtplib
import re
from email.mime.text import MIMEText
from flask import current_app


def generate_user_id():
    """Generate a unique-looking User ID, e.g. PW-7K2H9Q. Never based on name."""
    chars = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(chars, k=6))
    return f"PW-{suffix}"


def generate_order_id():
    chars = string.digits
    return "ORD" + "".join(random.choices(chars, k=8))


def generate_booking_id():
    chars = string.digits
    return "BKG" + "".join(random.choices(chars, k=8))


def generate_reset_token():
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=32))


def is_valid_password(password):
    """Exactly 8 characters, as required by the master prompt."""
    return isinstance(password, str) and len(password) == 8


# ---------------------------------------------------------------------------
# Delivery address validation - Karnataka only, fixed state + city dropdown
# ---------------------------------------------------------------------------
KARNATAKA_CITIES = (
    "Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Dharwad", "Belagavi",
    "Kalaburagi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga",
    "Tumakuru", "Udupi", "Hassan", "Mandya", "Kolar", "Chikkamagaluru",
    "Chitradurga", "Raichur", "Bidar", "Bagalkot", "Gadag", "Haveri",
    "Koppal", "Yadgir", "Ramanagara", "Chamarajanagar", "Kodagu",
    "Uttara Kannada",
)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Karnataka PIN codes fall in the 560000-591999 range.
KARNATAKA_PINCODE_PATTERN = re.compile(r"^5[6-9]\d{4}$")


def validate_delivery_address(address):
    """
    Validates a dog/food delivery address: full name, phone, house number,
    street, area, a Karnataka city from the fixed list, state fixed to
    Karnataka, a Karnataka-range pincode, and an optional but format-checked
    email. Raises ValueError with a user-facing message, or returns nothing
    on success.
    """
    address = address or {}

    for field in ("full_name", "phone", "house_number", "street", "area", "city", "pincode"):
        if not (address.get(field) or "").strip():
            raise ValueError(f"Please fill in the '{field.replace('_', ' ')}' field.")

    if address.get("city") not in KARNATAKA_CITIES:
        raise ValueError("Please choose a valid Karnataka city from the list.")

    if (address.get("state") or "Karnataka").strip() != "Karnataka":
        raise ValueError("Delivery is currently available within Karnataka only.")

    pincode = (address.get("pincode") or "").strip()
    if not KARNATAKA_PINCODE_PATTERN.match(pincode):
        raise ValueError("Please enter a valid 6-digit Karnataka PIN code.")

    email = (address.get("email") or "").strip()
    if email and not EMAIL_PATTERN.match(email):
        raise ValueError("Please enter a valid email address.")

    phone = (address.get("phone") or "").strip()
    if not re.match(r"^\d{10}$", phone):
        raise ValueError("Please enter a valid 10-digit phone number.")


# ---------------------------------------------------------------------------
# Payment (MOCK - no real payment gateway; format-validated only)
# ---------------------------------------------------------------------------
PAYMENT_METHODS = ("COD", "UPI", "Card")
UPI_PATTERN = re.compile(r"^[\w.\-]{2,256}@[a-zA-Z]{2,64}$")
CARD_PATTERN = re.compile(r"^\d{13,19}$")


def validate_payment(method, payment_data):
    """
    Validates a payment method + its mock details and returns a short
    payment_reference string to store with the order/booking, or raises
    ValueError with a user-facing message.

    This is a MOCK payment flow for a college project - no real payment
    gateway is called. COD needs nothing. UPI/Card are format-checked only.
    """
    payment_data = payment_data or {}

    if method == "COD":
        return "Cash on Delivery"

    if method == "UPI":
        upi_id = (payment_data.get("upi_id") or "").strip()
        if not UPI_PATTERN.match(upi_id):
            raise ValueError("Please enter a valid UPI ID (e.g. name@bank).")
        return upi_id

    if method == "Card":
        card_number = re.sub(r"\s+", "", payment_data.get("card_number") or "")
        expiry = (payment_data.get("expiry") or "").strip()
        cvv = (payment_data.get("cvv") or "").strip()
        name = (payment_data.get("card_name") or "").strip()

        if not CARD_PATTERN.match(card_number):
            raise ValueError("Please enter a valid card number.")
        if not re.match(r"^(0[1-9]|1[0-2])\/\d{2}$", expiry):
            raise ValueError("Please enter the expiry as MM/YY.")
        if not re.match(r"^\d{3,4}$", cvv):
            raise ValueError("Please enter a valid CVV.")
        if len(name) < 2:
            raise ValueError("Please enter the name on the card.")

        masked = "**** **** **** " + card_number[-4:]
        return masked

    raise ValueError("Please choose a valid payment method.")


def send_email(to_email, subject, body):
    """
    Sends an email if MAIL_USERNAME/MAIL_PASSWORD are configured.
    Otherwise, just logs the email to the console - useful for local dev/testing
    so you can see the generated User ID / reset token without real SMTP setup.
    """
    mail_user = current_app.config.get("MAIL_USERNAME")
    mail_pass = current_app.config.get("MAIL_PASSWORD")

    if not mail_user or not mail_pass:
        print("=" * 60)
        print(f"[DEV EMAIL] To: {to_email}")
        print(f"[DEV EMAIL] Subject: {subject}")
        print(f"[DEV EMAIL] Body:\n{body}")
        print("=" * 60)
        return True

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = mail_user
        msg["To"] = to_email

        server = smtplib.SMTP(
            current_app.config["MAIL_SERVER"], current_app.config["MAIL_PORT"]
        )
        server.starttls()
        server.login(mail_user, mail_pass)
        server.sendmail(mail_user, [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False
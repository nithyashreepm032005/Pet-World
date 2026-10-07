"""PetWorld AI Assistant - a "dashboard guide" for users.

POST /api/assistant/chat
    body: { "message": str, "language": "en"|"kn"|"hi", "page": "home.html" }
    resp: { "reply": str, "actions": [{"label", "href"}], "suggestions": [str],
            "source": "ai" | "local" }

Two modes:
  * If AI_API_KEY is configured, the question is forwarded to an
    OpenAI-compatible chat-completions API (key stays on the server).
  * Otherwise - or whenever the AI call fails - a built-in knowledge base
    answers using only the pages that really exist in this app.

The assistant never touches user data: it only returns text and links to
existing pages, so bookings/pet records are always changed by the user
themselves on the right page.
"""

import json
import re
import urllib.error
import urllib.request

from flask import Blueprint, jsonify, request, current_app

assistant_bp = Blueprint("assistant", __name__)

SUPPORTED_LANGUAGES = ("en", "kn", "hi")
MAX_MESSAGE_LENGTH = 1000

# Every page the assistant may link to must already exist in frontend/.
ALLOWED_PAGES = {
    "home.html",
    "dogs.html",
    "food.html",
    "services.html",
    "book-service.html",
    "bookings.html",
    "track-service.html",
    "my-dogs.html",
    "orders.html",
    "cart.html",
    "checkout.html",
    "favourites.html",
    "account.html",
    "admin.html",
    "employee.html",
}

UNKNOWN_REPLY = {
    "en": "I can help you find your way around the PetWorld dashboard: Dogs, Food, Services (grooming & training), Bookings, My Dogs, Orders, Cart and Profile. What are you looking for?",
    "kn": "ನಾನು ಪೆಟ್‌ವರ್ಲ್ಡ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಲ್ಲೆ: ನಾಯಿಗಳು, ಆಹಾರ, ಸೇವೆಗಳು (ಗ್ರೂಮಿಂಗ್ ಮತ್ತು ತರಬೇತಿ), ಬುಕಿಂಗ್‌ಗಳು, ನನ್ನ ನಾಯಿಗಳು, ಆರ್ಡರ್‌ಗಳು, ಕಾರ್ಟ್ ಮತ್ತು ಪ್ರೊಫೈಲ್. ನಿಮಗೇನು ಬೇಕು?",
    "hi": "मैं आपको पेटवर्ल्ड डैशबोर्ड में राह दिखा सकता हूँ: कुत्ते, खाना, सेवाएँ (ग्रूमिंग और ट्रेनिंग), बुकिंग, मेरे कुत्ते, ऑर्डर, कार्ट और प्रोफ़ाइल। आपको क्या चाहिए?",
}

DEFAULT_SUGGESTIONS = {
    "en": [
        "Where can I book a service?",
        "How do I add my dog?",
        "Where can I see my bookings?",
        "How do I buy dog food?",
        "How can I edit my profile?",
    ],
    "kn": [
        "ಸೇವೆ ಬುಕ್ ಮಾಡಲು ಎಲ್ಲಿ ಹೋಗಬೇಕು?",
        "ನಾಯಿಯನ್ನು ಹೇಗೆ ಸೇರಿಸಬೇಕು?",
        "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳು ಎಲ್ಲಿ ಸಿಗುತ್ತವೆ?",
        "ನಾಯಿ ಆಹಾರವನ್ನು ಹೇಗೆ ಖರೀದಿಸಬೇಕು?",
        "ನನ್ನ ಪ್ರೊಫೈಲ್ ಹೇಗೆ ಸಂಪಾದಿಸಬೇಕು?",
    ],
    "hi": [
        "सेवा बुक करने के लिए कहाँ जाऊँ?",
        "मैं अपना कुत्ता कैसे जोड़ूँ?",
        "मेरी बुकिंग कहाँ दिखेंगी?",
        "डॉग फ़ूड कैसे खरीदूँ?",
        "अपनी प्रोफ़ाइल कैसे संपादित करूँ?",
    ],
}

# ---------------------------------------------------------------------------
# Knowledge base. href=None means "this page does not exist" - the reply
# explains that honestly instead of inventing a link.
# ---------------------------------------------------------------------------
KNOWLEDGE = [
    {
        "id": "home",
        "href": "home.html",
        "keywords": [
            "dashboard", "home page", "main page", "overview", "welcome",
            "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "ಮುಖಪುಟ", "डैशबोर्ड", "होम पेज", "मुख्य पेज",
        ],
        "label": {"en": "Go to Home", "kn": "ಮುಖಪುಟಕ್ಕೆ ಹೋಗಿ", "hi": "होम पर जाएँ"},
        "reply": {
            "en": "Your Home dashboard has three main cards: DOGS, FOOD and SERVICES. Open one to start, or use the ❤ Favourites, 🛒 Cart and 👤 Account links in the top bar.",
            "kn": "ನಿಮ್ಮ ಮುಖಪುಟ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಮೂರು ಮುಖ್ಯ ಕಾರ್ಡ್‌ಗಳಿವೆ: ನಾಯಿಗಳು, ಆಹಾರ ಮತ್ತು ಸೇವೆಗಳು. ಒಂದನ್ನು ತೆರೆಯಿರಿ, ಅಥವಾ ಮೇಲಿನ ಪಟ್ಟಿಯಲ್ಲಿನ ❤ ಮೆಚ್ಚಿನವು, 🛒 ಕಾರ್ಟ್ ಮತ್ತು 👤 ಖಾತೆ ಕೊಂಡಿಗಳನ್ನು ಬಳಸಿ.",
            "hi": "आपके होम डैशबोर्ड में तीन मुख्य कार्ड हैं: कुत्ते, खाना और सेवाएँ। कोई भी खोलें, या ऊपर की पट्टी के ❤ पसंदीदा, 🛒 कार्ट और 👤 खाता लिंक उपयोग करें।",
        },
    },
    {
        "id": "book_service",
        "href": "services.html",
        "keywords": [
            "book a service", "book service", "booking", "book", "appointment",
            "schedule a", "new booking", "service",
            "ಬುಕ್", "ಬುಕಿಂಗ್", "ಸೇವೆ", "नियुक्ति", "बुक", "बुकिंग", "सेवा",
        ],
        "label": {"en": "Go to Services", "kn": "ಸೇವೆಗಳಿಗೆ ಹೋಗಿ", "hi": "सेवाओं पर जाएँ"},
        "reply": {
            "en": "Go to Services → choose the service (Grooming or Training), pick a package, date and time, then press Confirm Booking. Your booking then appears under My Bookings.",
            "kn": "ಸೇವೆಗಳಿಗೆ ಹೋಗಿ → ಸೇವೆ ಆಯ್ಕೆಮಾಡಿ (ಗ್ರೂಮಿಂಗ್ ಅಥವಾ ತರಬೇತಿ), ಪ್ಯಾಕೇಜ್, ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ಆರಿಸಿ, ನಂತರ ಬುಕಿಂಗ್ ದೃಢೀಕರಿಸಿ ಒತ್ತಿರಿ. ನಿಮ್ಮ ಬುಕಿಂಗ್ ನಂತರ ನನ್ನ ಬುಕಿಂಗ್‌ಗಳಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.",
            "hi": "सेवाएँ खोलें → सेवा चुनें (ग्रूमिंग या ट्रेनिंग), पैकेज, तारीख और समय चुनें, फिर बुकिंग की पुष्टि करें दबाएँ। आपकी बुकिंग फिर मेरी बुकिंग में दिखेगी।",
        },
    },
    {
        "id": "grooming",
        "href": "services.html",
        "keywords": [
            "grooming", "groom", "bath", "spa", "haircut", "nail", "brush",
            "ಗ್ರೂಮಿಂಗ್", "ಸ್ನಾನ", "नहाने", "स्पा", "बाल कटवाना",
        ],
        "label": {"en": "Go to Grooming", "kn": "ಗ್ರೂಮಿಂಗ್‌ಗೆ ಹೋಗಿ", "hi": "ग्रूमिंग पर जाएँ"},
        "reply": {
            "en": "Go to Services → Grooming & Spa. You can book a Store Service (bring your pet to our store) or a Home Service (we come to you, Bengaluru only), then choose date and time.",
            "kn": "ಸೇವೆಗಳಿಗೆ ಹೋಗಿ → ಗ್ರೂಮಿಂಗ್ ಮತ್ತು ಸ್ಪಾ. ನೀವು ಅಂಗಡಿ ಸೇವೆ (ಸಾಕುಪ್ರಾಣಿಯನ್ನು ಅಂಗಡಿಗೆ ತನ್ನಿ) ಅಥವಾ ಮನೆ ಸೇವೆ (ನಾವೇ ಬರುತ್ತೇವೆ, ಬೆಂಗಳೂರಿನಲ್ಲಿ ಮಾತ್ರ) ಆಯ್ಕೆಮಾಡಿ, ನಂತರ ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ಆರಿಸಿ.",
            "hi": "सेवाएँ खोलें → ग्रूमिंग और स्पा। आप दुकान सेवा (पालतू को दुकान पर लाएँ) या होम सेवा (हम घर आएँगे, केवल बेंगलुरु) चुन सकते हैं, फिर तारीख और समय चुनें।",
        },
    },
    {
        "id": "training",
        "href": "services.html",
        "keywords": [
            "training", "train my dog", "obedience", "puppy training", "trick",
            "ತರಬೇತಿ", "प्रशिक्षण", "आज्ञा",
        ],
        "label": {"en": "Go to Training", "kn": "ತರಬೇತಿಗೆ ಹೋಗಿ", "hi": "ट्रेनिंग पर जाएँ"},
        "reply": {
            "en": "Go to Services → Obedience Training. Pick a package, date and time slot and confirm - training happens at our store or at your home.",
            "kn": "ಸೇವೆಗಳಿಗೆ ಹೋಗಿ → ಆಜ್ಞಾ ತರಬೇತಿ. ಪ್ಯಾಕೇಜ್, ದಿನಾಂಕ ಮತ್ತು ಸಮಯ ಆರಿಸಿ ದೃಢೀಕರಿಸಿ - ತರಬೇತಿ ನಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಅಥವಾ ನಿಮ್ಮ ಮನೆಯಲ್ಲಿ ನಡೆಯುತ್ತದೆ.",
            "hi": "सेवाएँ खोलें → आज्ञा ट्रेनिंग। पैकेज, तारीख और समय चुनकर पुष्टि करें - ट्रेनिंग हमारी दुकान या आपके घर पर होती है।",
        },
    },
    {
        "id": "my_bookings",
        "href": "bookings.html",
        "keywords": [
            "my bookings", "see bookings", "view bookings", "booking history",
            "previous bookings", "past bookings", "appointments",
            "ನನ್ನ ಬುಕಿಂಗ್", "बुकिंग देखनी", "मेरी बुकिंग", "पिछली बुकिंग",
        ],
        "label": {"en": "Go to My Bookings", "kn": "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरी बुकिंग पर जाएँ"},
        "reply": {
            "en": "Open My Bookings to see every grooming/training booking with its date, time, price, status and payment. Home-service bookings can also be tracked live from there.",
            "kn": "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ - ಪ್ರತಿ ಗ್ರೂಮಿಂಗ್/ತರಬೇತಿ ಬುಕಿಂಗ್‌ನ ದಿನಾಂಕ, ಸಮಯ, ಬೆಲೆ, ಸ್ಥಿತಿ ಮತ್ತು ಪಾವತಿ ಕಾಣಿಸುತ್ತದೆ. ಮನೆ ಸೇವೆಯ ಬುಕಿಂಗ್‌ಗಳನ್ನು ಅಲ್ಲಿಯೇ ಲೈವ್ ಆಗಿ ಟ್ರ್ಯಾಕ್ ಮಾಡಬಹುದು.",
            "hi": "मेरी बुकिंग खोलें - हर ग्रूमिंग/ट्रेनिंग बुकिंग की तारीख, समय, कीमत, स्थिति और भुगतान दिखेगा। होम-सेवा बुकिंग वहीं से लाइव ट्रैक भी कर सकते हैं।",
        },
    },
    {
        "id": "track",
        "href": "bookings.html",
        "keywords": [
            "track", "tracking", "where is the employee", "live location",
            "ನನ್ನ ಸ್ಥಳ", "ट्रैक", "कर्मचारी कहाँ",
        ],
        "label": {"en": "Go to My Bookings", "kn": "ನನ್ನ ಬುಕಿಂಗ್‌ಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरी बुकिंग पर जाएँ"},
        "reply": {
            "en": "Tracking lives on the booking itself: open My Bookings and press 📍 Track Employee on an active home-service booking - the map refreshes every 5 seconds.",
            "kn": "ಟ್ರ್ಯಾಕಿಂಗ್ ಬುಕಿಂಗ್‌ನಲ್ಲಿಯೇ ಇದೆ: ನನ್ನ ಬುಕಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ ಮತ್ತು ಸಕ್ರಿಯ ಮನೆ ಸೇವಾ ಬುಕಿಂಗ್‌ನಲ್ಲಿ 📍 ಸಿಬ್ಬಂದಿ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ ಒತ್ತಿರಿ - ನಕ್ಷೆ ಪ್ರತಿ 5 ಸೆಕೆಂಡ್‌ಗಳಿಗೆ ನವೀಕರಣಗೊಳ್ಳುತ್ತದೆ.",
            "hi": "ट्रैकिंग बुकिंग पर ही मिलती है: मेरी बुकिंग खोलें और सक्रिय होम-सेवा बुकिंग पर 📍 कर्मचारी ट्रैक करें दबाएँ - मैप हर 5 सेकंड में रिफ्रेश होता है।",
        },
    },
    {
        "id": "add_dog",
        "href": "my-dogs.html",
        "keywords": [
            "add my dog", "add dog", "my dog", "my dogs", "manage my pets",
            "manage pets", "pet profile", "new dog", "register dog",
            "ನನ್ನ ನಾಯಿ", "ನಾಯಿ ಸೇರಿಸಿ", "मेरा कुत्ता", "कुत्ता जोड़ें", "पालतू",
        ],
        "label": {"en": "Go to My Dogs", "kn": "ನನ್ನ ನಾಯಿಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरे कुत्ते पर जाएँ"},
        "reply": {
            "en": "Go to My Dogs → + Add Dog. Enter the dog's name, breed, vaccination date, reminder interval and notes, then press Save. Edit or remove a dog from the same page.",
            "kn": "ನನ್ನ ನಾಯಿಗಳಿಗೆ ಹೋಗಿ → + ನಾಯಿ ಸೇರಿಸಿ. ನಾಯಿಯ ಹೆಸರು, ತಳಿ, ಲಸಿಕೆ ದಿನಾಂಕ, ಜ್ಞಾಪನೆ ಅವಧಿ ಮತ್ತು ಟಿಪ್ಪಣಿಗಳನ್ನು ನಮೂದಿಸಿ, ನಂತರ ಉಳಿಸಿ ಒತ್ತಿರಿ. ಅದೇ ಪುಟದಲ್ಲಿ ಸಂಪಾದಿಸಬಹುದು ಅಥವಾ ತೆಗೆದುಹಾಕಬಹುದು.",
            "hi": "मेरे कुत्ते खोलें → + कुत्ता जोड़ें। कुत्ते का नाम, नस्ल, टीके की तारीख, रिमाइंडर अंतराल और नोट्स भरें, फिर सहेजें दबाएँ। उसी पेज से संपादन या हटाना होगा।",
        },
    },
    {
        "id": "vaccination",
        "href": "my-dogs.html",
        "keywords": [
            "vaccination", "vaccination date", "vaccine", "vaccinate",
            "injection", "next due", "reminder",
            "ಲಸಿಕೆ", "टीका", "टीकाकरण", "अगली तारीख",
        ],
        "label": {"en": "Go to My Dogs", "kn": "ನನ್ನ ನಾಯಿಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरे कुत्ते पर जाएँ"},
        "reply": {
            "en": "Open My Dogs → press Edit on the dog → update the Vaccination Date and reminder interval (days) → Save. The 'Next Vaccination Due' date is recalculated automatically; always confirm the real schedule with your vet.",
            "kn": "ನನ್ನ ನಾಯಿಗಳನ್ನು ತೆರೆಯಿರಿ → ನಾಯಿಯ ಮೇಲೆ ಸಂಪಾದಿಸಿ ಒತ್ತಿರಿ → ಲಸಿಕೆ ದಿನಾಂಕ ಮತ್ತು ಜ್ಞಾಪನೆ ಅವಧಿ (ದಿನಗಳು) ನವೀಕರಿಸಿ → ಉಳಿಸಿ. 'ಮುಂದಿನ ಲಸಿಕೆ' ದಿನಾಂಕ ತಾನಾಗಿಯೇ ಮರುಲೆಕ್ಕಹಾಕಲ್ಪಡುತ್ತದೆ; ನಿಜವಾದ ವೇಳಾಪಟ್ಟಿಯನ್ನು ಯಾವಾಗಲೂ ವೈದ್ಯರೊಂದಿಗೆ ದೃಢೀಕರಿಸಿ.",
            "hi": "मेरे कुत्ते खोलें → कुत्ते पर संपादित करें दबाएँ → टीके की तारीख और रिमाइंडर अंतराल (दिन) अपडेट करें → सहेजें। 'अगला टीका' तारीख अपने आप फिर से गणना होती है; असली कार्यक्रम हमेशा अपने डॉक्टर से पुष्टि करें।",
        },
    },
    {
        "id": "dogs",
        "href": "dogs.html",
        "keywords": [
            "buy a dog", "buy dog", "adopt", "puppy", "breeds", "breed",
            "choose a dog", "dog price", "dogs page",
            "ನಾಯಿ ಖರೀದಿ", "ಮರಿ", "कुत्ता खरीदें", "नस्ल", "पप्पी",
        ],
        "label": {"en": "Go to Dogs", "kn": "ನಾಯಿಗಳಿಗೆ ಹೋಗಿ", "hi": "कुत्तों पर जाएँ"},
        "reply": {
            "en": "Open Dogs to browse available breeds. Pick an age to see the price, then ❤ favourite it, add it to the 🛒 cart or press ⚡ Buy Now.",
            "kn": "ಲಭ್ಯವಿರುವ ತಳಿಗಳನ್ನು ನೋಡಲು ನಾಯಿಗಳನ್ನು ತೆರೆಯಿರಿ. ಬೆಲೆ ನೋಡಲು ವಯಸ್ಸು ಆರಿಸಿ, ನಂತರ ❤ ಮೆಚ್ಚಿನವು, 🛒 ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ ಅಥವಾ ⚡ ಈಗ ಖರೀದಿಸಿ ಒತ್ತಿರಿ.",
            "hi": "उपलब्ध नस्लें देखने के लिए कुत्ते खोलें। कीमत देखने के लिए उम्र चुनें, फिर ❤ पसंदीदा करें, 🛒 कार्ट में डालें या ⚡ अभी खरीदें दबाएँ।",
        },
    },
    {
        "id": "food",
        "href": "food.html",
        "keywords": [
            "dog food", "food", "buy food", "feed", "eat", "treats", "nutrition",
            "mbn",
            "ಆಹಾರ", "ತಿನ್ನುವ", "खाना", "डॉग फ़ूड", "भोजन", "उपहार",
        ],
        "label": {"en": "Go to Food", "kn": "ಆಹಾರಕ್ಕೆ ಹೋಗಿ", "hi": "खाने पर जाएँ"},
        "reply": {
            "en": "Open Food to buy MBN premium dog food: choose a weight (KG), then Add to Cart or Buy Now. You can also change the weight later in the cart.",
            "kn": "ಎಂಬಿಎನ್ ಪ್ರೀಮಿಯಂ ನಾಯಿ ಆಹಾರ ಖರೀದಿಸಲು ಆಹಾರವನ್ನು ತೆರೆಯಿರಿ: ತೂಕ (ಕೆಜಿ) ಆಯ್ಕೆಮಾಡಿ, ನಂತರ ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ ಅಥವಾ ಈಗ ಖರೀದಿಸಿ. ಕಾರ್ಟ್‌ನಲ್ಲಿ ತೂಕ ಬದಲಾಯಿಸಬಹುದು.",
            "hi": "एमबीएन प्रीमियम डॉग फ़ूड खरीदने के लिए खाना खोलें: वज़न (किग्रा) चुनें, फिर कार्ट में डालें या अभी खरीदें। कार्ट में वज़न बाद में भी बदल सकते हैं।",
        },
    },
    {
        "id": "toys",
        "href": None,
        "keywords": [
            "toy", "toys", "ball", "chew toy", "frisbee", "play toy",
            "ಆಟಿಕೆ", "चट्टे", "खिलौना", "गेंद",
        ],
        "label": None,
        "reply": {
            "en": "Toys are not available in PetWorld yet, so there is no toys page to open. Right now the shop covers Dogs, Food and Services - I can take you to any of those.",
            "kn": "ಪೆಟ್‌ವರ್ಲ್ಡ್‌ನಲ್ಲಿ ಇನ್ನೂ ಆಟಿಕೆಗಳು ಲಭ್ಯವಿಲ್ಲ, ಆದ್ದರಿಂದ ತೆರೆಯಲು ಆಟಿಕೆ ಪುಟವಿಲ್ಲ. ಈಗ ಅಂಗಡಿಯಲ್ಲಿ ನಾಯಿಗಳು, ಆಹಾರ ಮತ್ತು ಸೇವೆಗಳಿವೆ - ಯಾವುದಕ್ಕಾದರೂ ನಾನು ಕರೆದುಕೊಂಡು ಹೋಗಬಲ್ಲೆ.",
            "hi": "पेटवर्ल्ड में अभी खिलौने उपलब्ध नहीं हैं, इसलिए खोलने के लिए कोई खिलौना पेज नहीं है। अभी दुकान में कुत्ते, खाना और सेवाएँ हैं - मैं इनमें से किसी पर भी ले जा सकता हूँ।",
        },
    },
    {
        "id": "vet",
        "href": None,
        "keywords": [
            "veterinary", "vet", "doctor", "medical", "sick", "illness",
            "treatment", "clinic", "hospital",
            "ವೈದ್ಯ", "ಆಸ್ಪತ್ರೆ", "चिकित्सक", "बीमार", "अस्पताल", "इलाज",
        ],
        "label": None,
        "reply": {
            "en": "PetWorld has no veterinary booking page yet. Keep each dog's vaccination date in My Dogs and confirm the actual schedule with your own vet - I can open My Dogs for you.",
            "kn": "ಪೆಟ್‌ವರ್ಲ್ಡ್‌ನಲ್ಲಿ ಇನ್ನೂ ವೈದ್ಯಕೀಯ ಬುಕಿಂಗ್ ಪುಟವಿಲ್ಲ. ಪ್ರತಿ ನಾಯಿಯ ಲಸಿಕೆ ದಿನಾಂಕವನ್ನು ನನ್ನ ನಾಯಿಗಳಲ್ಲಿ ಇಟ್ಟುಕೊಳ್ಳಿ ಮತ್ತು ನಿಜವಾದ ವೇಳಾಪಟ್ಟಿಯನ್ನು ನಿಮ್ಮ ವೈದ್ಯರೊಂದಿಗೆ ದೃಢೀಕರಿಸಿ - ನಾನು ನನ್ನ ನಾಯಿಗಳನ್ನು ತೆರೆಯಬಲ್ಲೆ.",
            "hi": "पेटवर्ल्ड में अभी कोई पशु चिकित्सा बुकिंग पेज नहीं है। हर कुत्ते की टीके की तारीख मेरे कुत्तों में रखें और असली कार्यक्रम अपने डॉक्टर से पुष्टि करें - मैं मेरे कुत्ते खोल सकता हूँ।",
        },
    },
    {
        "id": "profile",
        "href": "account.html",
        "keywords": [
            "edit my profile", "update my profile", "my profile", "profile",
            "my account", "personal details", "change my phone",
            "change my address", "edit account",
            "ಪ್ರೊಫೈಲ್", "ಖಾತೆ ಸಂಪಾದನೆ", "प्रोफ़ाइल", "खाता", "पता बदलें",
        ],
        "label": {"en": "Go to Profile", "kn": "ಪ್ರೊಫೈಲ್‌ಗೆ ಹೋಗಿ", "hi": "प्रोफ़ाइल पर जाएँ"},
        "reply": {
            "en": "Go to Account → Profile Details to edit your full name, phone and address, then press Save Changes. The sidebar also links to My Dogs, Orders, Bookings, Favourites, Cart and Logout.",
            "kn": "ಖಾತೆಗೆ ಹೋಗಿ → ಪ್ರೊಫೈಲ್ ವಿವರಗಳಲ್ಲಿ ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು, ಫೋನ್ ಮತ್ತು ವಿಳಾಸ ಸಂಪಾದಿಸಿ, ನಂತರ ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಿ ಒತ್ತಿರಿ. ಬದಿಯ ಪಟ್ಟಿಯಲ್ಲಿ ನನ್ನ ನಾಯಿಗಳು, ಆರ್ಡರ್‌ಗಳು, ಬುಕಿಂಗ್‌ಗಳು, ಮೆಚ್ಚಿನವು, ಕಾರ್ಟ್ ಮತ್ತು ಲಾಗ್ ಔಟ್ ಕೊಂಡಿಗಳಿವೆ.",
            "hi": "खाते में जाएँ → प्रोफ़ाइल विवरण में अपना पूरा नाम, फ़ोन और पता संपादित करें, फिर बदलाव सहेजें दबाएँ। साइडबार से मेरे कुत्ते, ऑर्डर, बुकिंग, पसंदीदा, कार्ट और लॉग आउट के लिंक मिलते हैं।",
        },
    },
    {
        "id": "orders",
        "href": "orders.html",
        "keywords": [
            "my orders", "order status", "orders", "order", "purchase history",
            "where is my order", "delivery status", "shipment",
            "ನನ್ನ ಆರ್ಡರ್", "ಆರ್ಡರ್", "मेरे ऑर्डर", "ऑर्डर", "डिलीवरी",
        ],
        "label": {"en": "Go to My Orders", "kn": "ನನ್ನ ಆರ್ಡರ್‌ಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरे ऑर्डर पर जाएँ"},
        "reply": {
            "en": "Open My Orders to track every dog/food order: status, delivery address, payment, cancellation (within 24 hours) and returns (within 7 days of delivery).",
            "kn": "ಪ್ರತಿ ನಾಯಿ/ಆಹಾರದ ಆರ್ಡರ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಲು ನನ್ನ ಆರ್ಡರ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ: ಸ್ಥಿತಿ, ಡೆಲಿವರಿ ವಿಳಾಸ, ಪಾವತಿ, ರದ್ದುಪಡಿಸುವಿಕೆ (24 ಗಂಟೆಗಳ ಒಳಗೆ) ಮತ್ತು ವಾಪಸಾತಿ (ಡೆಲಿವರಿಯ 7 ದಿನಗಳ ಒಳಗೆ).",
            "hi": "हर कुत्ते/खाने के ऑर्डर ट्रैक करने के लिए मेरे ऑर्डर खोलें: स्थिति, डिलीवरी पता, भुगतान, रद्द (24 घंटे के भीतर) और वापसी (डिलीवरी के 7 दिनों के भीतर)।",
        },
    },
    {
        "id": "returns",
        "href": "orders.html",
        "keywords": [
            "return", "returns", "refund", "exchange", "send back",
            "ವಾಪಸಾತಿ", "ಹಿಂತಿರುಗಿ", "वापसी", "रिफंड", "बदलना",
        ],
        "label": {"en": "Go to My Orders", "kn": "ನನ್ನ ಆರ್ಡರ್‌ಗಳಿಗೆ ಹೋಗಿ", "hi": "मेरे ऑर्डर पर जाएँ"},
        "reply": {
            "en": "Returns are started from My Orders: open a delivered order and press ↩ Request Return (available for 7 days after delivery). Dogs cannot be returned online - contact PetWorld support for those.",
            "kn": "ವಾಪಸಾತಿಯನ್ನು ನನ್ನ ಆರ್ಡರ್‌ಗಳಿಂದ ಆರಂಭಿಸಿ: ತಲುಪಿಸಿದ ಆರ್ಡರ್ ತೆರೆಯಿರಿ ಮತ್ತು ↩ ವಾಪಸಾತಿ ಕೋರಿ ಒತ್ತಿರಿ (ಡೆಲಿವರಿಯ 7 ದಿನಗಳ ಒಳಗೆ). ನಾಯಿಗಳನ್ನು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ವಾಪಸು ಪಡೆಯಲಾಗದು - ಅವುಗಳಿಗಾಗಿ ಪೆಟ್‌ವರ್ಲ್ಡ್ ಸಹಾಯವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
            "hi": "वापसी मेरे ऑर्डर से शुरू होती है: डिलीवर हुआ ऑर्डर खोलें और ↩ वापसी का अनुरोध करें दबाएँ (डिलीवरी के 7 दिनों के भीतर)। कुत्तों को ऑनलाइन वापस नहीं किया जा सकता - उनके लिए पेटवर्ल्ड सहायता से संपर्क करें।",
        },
    },
    {
        "id": "cart",
        "href": "cart.html",
        "keywords": [
            "my cart", "cart", "basket", "checkout", "proceed to checkout",
            "ನನ್ನ ಕಾರ್ಟ್", "ಕಾರ್ಟ್", "चेकआउट", "कार्ट", "टोकरी",
        ],
        "label": {"en": "Go to Cart", "kn": "ಕಾರ್ಟ್‌ಗೆ ಹೋಗಿ", "hi": "कार्ट पर जाएँ"},
        "reply": {
            "en": "Your Cart is at cart.html: change quantities, remove items and press Proceed to Checkout when everything looks right. Dogs, food and services can be checked out together.",
            "kn": "ನಿಮ್ಮ ಕಾರ್ಟ್ cart.html ನಲ್ಲಿದೆ: ಪ್ರಮಾಣ ಬದಲಾಯಿಸಿ, ವಸ್ತುಗಳನ್ನು ತೆಗೆದುಹಾಕಿ ಮತ್ತು ಎಲ್ಲವೂ ಸರಿಯಾಗಿದ್ದರೆ ಚೆಕ್ಔಟ್‌ಗೆ ಹೋಗಿ ಒತ್ತಿರಿ. ನಾಯಿಗಳು, ಆಹಾರ ಮತ್ತು ಸೇವೆಗಳನ್ನು ಒಟ್ಟಿಗೆ ಚೆಕ್ ಔಟ್ ಮಾಡಬಹುದು.",
            "hi": "आपका कार्ट cart.html पर है: मात्रा बदलें, वस्तुएँ हटाएँ और सब ठीक हो तो चेकआउट पर जाएँ दबाएँ। कुत्ते, खाना और सेवाएँ साथ में चेकआउट हो सकते हैं।",
        },
    },
    {
        "id": "favourites",
        "href": "favourites.html",
        "keywords": [
            "favourite", "favorite", "favourites", "favorites", "wishlist",
            "saved items", "heart",
            "ಮೆಚ್ಚಿನ", "ಪ್ರಿಯ", "पसंदीदा", "पसंद", "सहेजी",
        ],
        "label": {"en": "Go to Favourites", "kn": "ಮೆಚ್ಚಿನವುಗಳಿಗೆ ಹೋಗಿ", "hi": "पसंदीदा पर जाएँ"},
        "reply": {
            "en": "Favourites (favourites.html) keeps everything you tapped the ❤ icon on - dogs, food and services - in one list.",
            "kn": "ಮೆಚ್ಚಿನವು (favourites.html) ನೀವು ❤ ಒತ್ತಿದ ಎಲ್ಲವನ್ನೂ - ನಾಯಿಗಳು, ಆಹಾರ ಮತ್ತು ಸೇವೆಗಳನ್ನೂ - ಒಂದೇ ಪಟ್ಟಿಯಲ್ಲಿ ಇಡುತ್ತದೆ.",
            "hi": "पसंदीदा (favourites.html) में जिन पर आपने ❤ दबाया है - कुत्ते, खाना और सेवाएँ - सब एक सूची में रहते हैं।",
        },
    },
    {
        "id": "logout",
        "href": "account.html",
        "keywords": [
            "logout", "log out", "sign out", "switch account", "exit",
            "ಲಾಗ್ ಔಟ್", "ಹೊರಗೆ", "लॉग आउट", "साइन आउट", "खाता बदलें",
        ],
        "label": {"en": "Go to Account", "kn": "ಖಾತೆಗೆ ಹೋಗಿ", "hi": "खाते पर जाएँ"},
        "reply": {
            "en": "Log out from the Account page: 🚪 Logout is the last link in the account sidebar (account.html).",
            "kn": "ಖಾತೆ ಪುಟದಿಂದ ಲಾಗ್ ಔಟ್ ಮಾಡಿ: 🚪 ಲಾಗ್ ಔಟ್ ಖಾತೆ ಬದಿಯ ಪಟ್ಟಿಯ ಕೊನೆಯ ಕೊಂಡಿಯಾಗಿದೆ (account.html).",
            "hi": "खाते पेज से लॉग आउट करें: 🚪 लॉग आउट खाते के साइडबार में आखिरी लिंक है (account.html)।",
        },
    },
    {
        "id": "language",
        "href": None,
        "keywords": [
            "change language", "language", "kannada", "hindi", "english",
            "translate", "multilingual",
            "ಭಾಷೆ", "ಕನ್ನಡ", "हिंदी", "हिन्दी", "भाषा", "अनुवाद",
        ],
        "label": None,
        "reply": {
            "en": "Use the 🌐 language selector in the top bar (next to Account) to switch between English, ಕನ್ನಡ and हिन्दी - your choice is remembered on every page.",
            "kn": "ಇಂಗ್ಲಿಷ್, ಕನ್ನಡ ಮತ್ತು हिन्दी ನಡುವೆ ಬದಲಾಯಿಸಲು ಮೇಲಿನ ಪಟ್ಟಿಯಲ್ಲಿ (ಖಾತೆಯ ಪಕ್ಕದಲ್ಲಿ) 🌐 ಭಾಷೆ ಆಯ್ಕೆಯನ್ನು ಬಳಸಿ - ನಿಮ್ಮ ಆಯ್ಕೆ ಪ್ರತಿ ಪುಟದಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.",
            "hi": "अंग्रेज़ी, कन्नड और हिन्दी के बीच बदलने के लिए ऊपर की पट्टी में (खाते के पास) 🌐 भाषा चुनने वाले विकल्प का उपयोग करें - आपका चुनाव हर पेज पर याद रहता है।",
        },
    },
    {
        "id": "notifications",
        "href": None,
        "keywords": [
            "notification", "notifications", "alerts", "messages", "inbox",
            "ಅಧಿಸೂಚನೆ", "ಸೂಚನೆ", "सूचना", "संदेश", "अलर्ट",
        ],
        "label": None,
        "reply": {
            "en": "PetWorld has no notifications page yet. Booking and order updates always show up on My Bookings and My Orders - I can open either page for you.",
            "kn": "ಪೆಟ್‌ವರ್ಲ್ಡ್‌ನಲ್ಲಿ ಇನ್ನೂ ಅಧಿಸೂಚನೆ ಪುಟವಿಲ್ಲ. ಬುಕಿಂಗ್ ಮತ್ತು ಆರ್ಡರ್ ನವೀಕರಣಗಳು ಯಾವಾಗಲೂ ನನ್ನ ಬುಕಿಂಗ್‌ಗಳು ಮತ್ತು ನನ್ನ ಆರ್ಡರ್‌ಗಳಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ - ಯಾವುದನ್ನಾದರೂ ತೆರೆಯಬಲ್ಲೆ.",
            "hi": "पेटवर्ल्ड में अभी कोई सूचना पेज नहीं है। बुकिंग और ऑर्डर के अपडेट हमेशा मेरी बुकिंग और मेरे ऑर्डर में दिखते हैं - मैं दोनों में से कोई भी खोल सकता हूँ।",
        },
    },
    {
        "id": "support",
        "href": None,
        "keywords": [
            "contact", "support", "help desk", "phone number", "call us",
            "complaint", "problem",
            "ಸಂಪರ್ಕ", "ಸಹಾಯ", "संपर्क", "मदद", "शिकायत",
        ],
        "label": None,
        "reply": {
            "en": "There is no contact page in PetWorld yet. Our store address is shown on the Services page (28, Bugle Rock Park, Basavanagudi, Bengaluru) with a Google Maps link. For account-specific help, tell me which page you are stuck on.",
            "kn": "ಪೆಟ್‌ವರ್ಲ್ಡ್‌ನಲ್ಲಿ ಇನ್ನೂ ಸಂಪರ್ಕ ಪುಟವಿಲ್ಲ. ನಮ್ಮ ಅಂಗಡಿಯ ವಿಳಾಸ ಸೇವೆಗಳ ಪುಟದಲ್ಲಿ ಗೂಗಲ್ ಮ್ಯಾಪ್ ಕೊಂಡಿಯೊಂದಿಗೆ ಕಾಣಿಸುತ್ತದೆ (28, ಬಗಲ್ ರಾಕ್ ಪಾರ್ಕ್, ಬಸವನಗುಡಿ, ಬೆಂಗಳೂರು). ಖಾತೆಗೆ ಸಂಬಂಧಿಸಿದ ಸಹಾಯಕ್ಕೆ, ನಿಮಗೆ ಯಾವ ಪುಟದಲ್ಲಿ ಸಮಸ್ಯೆ ಇದೆ ತಿಳಿಸಿ.",
            "hi": "पेटवर्ल्ड में अभी कोई संपर्क पेज नहीं है। हमारे स्टोर का पता सेवा पेज पर गूगल मैप लिंक के साथ दिखता है (28, बगल रॉक पार्क, बसवनगुड़ी, बेंगलुरु)। खाते से जुड़ी मदद के लिए बताइए कि किस पेज पर अटके हैं।",
        },
    },
    {
        "id": "admin",
        "href": "admin.html",
        "keywords": [
            "admin", "administrator", "admin dashboard", "manage products",
            "manage customers",
            "ಆಡಳಿತ", "ನಿರ್ವಾಹಕ", "एडमिन", "प्रबंधन", "व्यवस्थापक",
        ],
        "label": {"en": "Go to Admin Dashboard", "kn": "ಆಡಳಿತ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಹೋಗಿ", "hi": "एडमिन डैशबोर्ड पर जाएँ"},
        "reply": {
            "en": "The Admin Dashboard (admin.html) is only for PetWorld admin logins. It manages Dogs, Food, Services, Customers, Orders, Returns and Bookings. If you are a customer, your own data is under Account.",
            "kn": "ಆಡಳಿತ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ (admin.html) ಕೇವಲ ಪೆಟ್‌ವರ್ಲ್ಡ್ ಆಡಳಿತಿಕರ ಲಾಗಿನ್‌ಗಳಿಗೆ ಮಾತ್ರ. ಇದು ನಾಯಿಗಳು, ಆಹಾರ, ಸೇವೆಗಳು, ಗ್ರಾಹಕರು, ಆರ್ಡರ್‌ಗಳು, ವಾಪಸಾತಿಗಳು ಮತ್ತು ಬುಕಿಂಗ್‌ಗಳನ್ನು ನಿರ್ವಹಿಸುತ್ತದೆ. ನೀವು ಗ್ರಾಹಕರಾದರೆ, ನಿಮ್ಮ ಮಾಹಿತಿ ಖಾತೆಯಲ್ಲಿದೆ.",
            "hi": "एडमिन डैशबोर्ड (admin.html) केवल पेटवर्ल्ड एडमिन लॉगिन के लिए है। यह कुत्ते, खाना, सेवाएँ, ग्राहक, ऑर्डर, वापसियाँ और बुकिंग संभालता है। यदि आप ग्राहक हैं तो आपका डेटा खाते में है।",
        },
    },
    {
        "id": "employee",
        "href": "employee.html",
        "keywords": [
            "employee", "staff", "worker", "job", "driver", "start travel",
            "ಸಿಬ್ಬಂದಿ", "ಕೆಲಸ", "कर्मचारी", "काम", "नौकर",
        ],
        "label": {"en": "Go to Employee Dashboard", "kn": "ಸಿಬ್ಬಂದಿ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಹೋಗಿ", "hi": "कर्मचारी डैशबोर्ड पर जाएँ"},
        "reply": {
            "en": "The Employee Dashboard (employee.html) is where PetWorld staff log in with their email to see assigned home-service jobs, start travel and share their live location.",
            "kn": "ಸಿಬ್ಬಂದಿ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ (employee.html) ಪೆಟ್‌ವರ್ಲ್ಡ್ ಸಿಬ್ಬಂದಿ ತಮ್ಮ ಇಮೇಲ್‌ನಿಂದ ಲಾಗಿನ್ ಮಾಡಿ ನಿಯೋಜಿತ ಮನೆ ಸೇವಾ ಕೆಲಸಗಳನ್ನು ನೋಡಲು, ಪ್ರಯಾಣ ಪ್ರಾರಂಭಿಸಲು ಮತ್ತು ಲೈವ್ ಸ್ಥಳ ಹಂಚಿಕೊಳ್ಳಲು ಬಳಸುವ ಪುಟ.",
            "hi": "कर्मचारी डैशबोर्ड (employee.html) पर पेटवर्ल्ड कर्मचारी अपने ईमेल से लॉगिन करके नियुक्त होम-सेवा काम देखते हैं, यात्रा शुरू करते हैं और लाइव स्थान साझा करते हैं।",
        },
    },
    {
        "id": "help",
        "href": None,
        "keywords": [
            "help", "i don't understand", "dont understand", "how does this work",
            "what can you do", "guide", "explain", "confused", "lost",
            "ಸಹಾಯ", "ಅರ್ಥವಾಗುತ್ತಿಲ್ಲ", "मदद", "समझ नहीं", "बताओ",
        ],
        "label": None,
        "reply": {
            "en": "I guide you around this dashboard. Here is the map of PetWorld:\n• Dogs - browse and buy breeds\n• Food - MBN dog food\n• Services - book grooming or training\n• My Bookings - see/track appointments\n• My Dogs - add dogs & vaccination dates\n• My Orders - status, cancel, return\n• Cart / Checkout - buy things\n• Account - edit your profile\nAsk me anything about these and I'll point you to the right page.",
            "kn": "ನಾನು ಈ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮಗೆ ಮಾರ್ಗದರ್ಶನ ಮಾಡುತ್ತೇನೆ. ಪೆಟ್‌ವರ್ಲ್ಡ್‌ನ ನಕ್ಷೆ ಇಲ್ಲಿದೆ:\n• ನಾಯಿಗಳು - ತಳಿಗಳನ್ನು ನೋಡಿ ಖರೀದಿಸಿ\n• ಆಹಾರ - ಎಂಬಿಎನ್ ನಾಯಿ ಆಹಾರ\n• ಸೇವೆಗಳು - ಗ್ರೂಮಿಂಗ್ ಅಥವಾ ತರಬೇತಿ ಬುಕ್ ಮಾಡಿ\n• ನನ್ನ ಬುಕಿಂಗ್‌ಗಳು - ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ನೋಡಿ/ಟ್ರ್ಯಾಕ್ ಮಾಡಿ\n• ನನ್ನ ನಾಯಿಗಳು - ನಾಯಿ ಮತ್ತು ಲಸಿಕೆ ದಿನಾಂಕ ಸೇರಿಸಿ\n• ನನ್ನ ಆರ್ಡರ್‌ಗಳು - ಸ್ಥಿತಿ, ರದ್ದು, ವಾಪಸಾತಿ\n• ಕಾರ್ಟ್ / ಚೆಕ್ಔಟ್ - ಖರೀದಿ\n• ಖಾತೆ - ಪ್ರೊಫೈಲ್ ಸಂಪಾದಿಸಿ\nಇವುಗಳ ಬಗ್ಗೆ ಏನನ್ನಾದರೂ ಕೇಳಿ, ಸರಿಯಾದ ಪುಟಕ್ಕೆ ಕರೆದುಕೊಂಡು ಹೋಗುತ್ತೇನೆ.",
            "hi": "मैं इस डैशबोर्ड में आपकी राह दिखाता हूँ। पेटवर्ल्ड का नक्शा:\n• कुत्ते - नस्लें देखें और खरीदें\n• खाना - एमबीएन डॉग फ़ूड\n• सेवाएँ - ग्रूमिंग या ट्रेनिंग बुक करें\n• मेरी बुकिंग - अपॉइंटमेंट देखें/ट्रैक करें\n• मेरे कुत्ते - कुत्ते और टीका तारीख जोड़ें\n• मेरे ऑर्डर - स्थिति, रद्द, वापसी\n• कार्ट / चेकआउट - खरीदारी\n• खाता - प्रोफ़ाइल संपादित करें\nइनके बारे में कुछ भी पूछें, मैं सही पेज पर ले जाऊँगा।",
        },
    },
]

GREETING_REPLY = {
    "en": "Hello! Ask me where anything lives in the PetWorld dashboard - for example \"Where can I book grooming?\" or \"How do I add my dog?\"",
    "kn": "ನಮಸ್ಕಾರ! ಪೆಟ್‌ವರ್ಲ್ಡ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಏನು ಎಲ್ಲಿದೆ ಎಂದು ಕೇಳಿ - ಉದಾ: \"ಗ್ರೂಮಿಂಗ್ ಬುಕ್ ಮಾಡಲು ಎಲ್ಲಿ?\" ಅಥವಾ \"ನಾಯಿಯನ್ನು ಹೇಗೆ ಸೇರಿಸಬೇಕು?\"",
    "hi": "नमस्ते! पूछिए कि पेटवर्ल्ड डैशबोर्ड में क्या कहाँ मिलेगा - जैसे \"ग्रूमिंग बुक करने के लिए कहाँ जाऊँ?\" या \"मैं अपना कुत्ता कैसे जोड़ूँ?\"",
}

THANKS_REPLY = {
    "en": "You're welcome! Ask me any time if you need another page.",
    "kn": "ದಯವಿಟ್ಟು! ಮತ್ತೊಂದು ಪುಟ ಬೇಕಾದರೆ ಯಾವಾಗಲೂ ಕೇಳಿ.",
    "hi": "आपका स्वागत है! दूसरा पेज चाहिए तो कभी भी पूछें।",
}


def _clean_language(value):
    lang = (value or "").strip().lower()
    return lang if lang in SUPPORTED_LANGUAGES else "en"


def _find_entry(message):
    """Score the knowledge base against the user's message (any language)."""
    text = message.lower()
    best, best_score = None, 0
    for entry in KNOWLEDGE:
        score = 0
        for keyword in entry["keywords"]:
            if keyword in text:
                # Longer / multi-word keywords are more specific, so they win.
                score += len(keyword.replace(" ", "")) + keyword.count(" ") * 3
        if score > best_score:
            best, best_score = entry, score
    return best if best_score >= 3 else None


def _actions_for(entry, lang):
    if not entry or not entry.get("href") or entry["href"] not in ALLOWED_PAGES:
        return []
    label = (entry.get("label") or {}).get(lang) or (entry.get("label") or {}).get("en")
    if not label:
        return []
    return [{"label": label, "href": entry["href"]}]


def _local_answer(message, lang):
    text = message.lower().strip()
    if len(text) <= 12 and any(
        word in text for word in ("hi", "hello", "hey", "namaste", "ನಮಸ್ಕಾರ", "नमस्ते")
    ):
        return {
            "reply": GREETING_REPLY.get(lang, GREETING_REPLY["en"]),
            "actions": [],
            "suggestions": DEFAULT_SUGGESTIONS[lang],
            "source": "local",
        }
    if any(word in text for word in ("thank", "thanks", "dhanyavad", "ಧನ್ಯವಾದ", "धन्यवाद")):
        return {
            "reply": THANKS_REPLY.get(lang, THANKS_REPLY["en"]),
            "actions": [],
            "suggestions": DEFAULT_SUGGESTIONS[lang],
            "source": "local",
        }

    entry = _find_entry(message)
    if entry:
        return {
            "reply": entry["reply"].get(lang, entry["reply"]["en"]),
            "actions": _actions_for(entry, lang),
            "suggestions": DEFAULT_SUGGESTIONS[lang],
            "source": "local",
        }
    return {
        "reply": UNKNOWN_REPLY.get(lang, UNKNOWN_REPLY["en"]),
        "actions": [],
        "suggestions": DEFAULT_SUGGESTIONS[lang],
        "source": "local",
    }


def _system_prompt(lang):
    lang_name = {"en": "English", "kn": "Kannada", "hi": "Hindi"}[lang]
    pages = "\n".join(
        f"- {page}: {purpose}"
        for page, purpose in [
            ("home.html", "customer dashboard home (DOGS / FOOD / SERVICES cards)"),
            ("dogs.html", "browse and buy dog breeds"),
            ("food.html", "buy MBN dog food"),
            ("services.html", "list of grooming & training services, entry point for booking"),
            ("book-service.html?service_id=N", "booking form for one service (date/time/mode/payment)"),
            ("bookings.html", "the customer's own bookings, with status and tracking link"),
            ("track-service.html?id=N", "live map tracking of a home-service booking"),
            ("my-dogs.html", "add/edit the customer's dogs and vaccination dates"),
            ("orders.html", "the customer's orders, cancellation and returns"),
            ("cart.html", "shopping cart"),
            ("checkout.html", "delivery address + payment, places the order"),
            ("favourites.html", "saved favourite items"),
            ("account.html", "profile edit + sidebar links + logout"),
            ("admin.html", "admin-only dashboard (products, customers, orders)"),
            ("employee.html", "employee-only dashboard (home-service jobs)"),
        ]
    )
    return (
        "You are the PetWorld Dashboard Assistant, a helpful guide inside the "
        "PetWorld pet-store web app. Your ONLY job is to help users understand "
        "and navigate their dashboard (booking services, grooming, dogs, food, "
        "orders, profile, etc.).\n\n"
        f"Reply in {lang_name}.\n\n"
        "Rules:\n"
        "1. Only recommend pages from this exact list of pages that exist:\n"
        f"{pages}\n"
        "2. Never invent URLs, pages or features. If the user asks about "
        "something that does not exist (for example toys, veterinary care, "
        "notifications, contact/support), clearly say it is not currently "
        "available and offer the closest page that does exist.\n"
        "3. Guide, do not act: never claim to have created, changed or "
        "cancelled anything. Tell the user which page to open instead.\n"
        "4. Never reveal secrets, API keys, database or server details, admin "
        "information, or any other user's data.\n"
        "5. Keep answers short (2-4 sentences), friendly and concrete "
        "(mention the exact page/section name).\n"
        "6. Answer ONLY in the requested language when you can.\n\n"
        "Return ONLY a JSON object in this shape:\n"
        '{"reply": "…", "actions": [{"label": "Go to Grooming", '
        '"href": "services.html"}], "suggestions": ["…", "…"]}\n'
        '"actions" must be an empty array when no navigation helps, and every '
        "href must come from the list above."
    )


def _call_ai(system_prompt, user_message, lang):
    """Call an OpenAI-compatible chat completions endpoint (server-side key)."""
    cfg = current_app.config
    api_key = cfg.get("AI_API_KEY") or ""
    if not api_key:
        return None

    base_url = (cfg.get("AI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    payload = {
        "model": cfg.get("AI_MODEL") or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.2,
    }
    request_obj = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    timeout = cfg.get("AI_TIMEOUT_SECONDS") or 20
    with urllib.request.urlopen(request_obj, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))

    content = body["choices"][0]["message"]["content"]
    # Be forgiving about markdown fences or surrounding prose.
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise ValueError("no JSON object in AI reply")
    data = json.loads(match.group(0))

    reply = str(data.get("reply") or "").strip()
    if not reply:
        raise ValueError("empty AI reply")

    actions = []
    for action in data.get("actions") or []:
        if not isinstance(action, dict):
            continue
        href = str(action.get("href") or "")
        if href in ALLOWED_PAGES:
            actions.append(
                {"label": str(action.get("label") or href)[:80], "href": href}
            )

    suggestions = [
        str(s)[:120] for s in (data.get("suggestions") or []) if isinstance(s, str)
    ][:5]

    return {
        "reply": reply[:2000],
        "actions": actions,
        "suggestions": suggestions or DEFAULT_SUGGESTIONS[lang],
        "source": "ai",
    }


@assistant_bp.route("/assistant/chat", methods=["POST"])
def assistant_chat():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    lang = _clean_language(data.get("language"))

    if not message:
        return jsonify({"error": "Message is required."}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": "Message is too long."}), 400

    # The AI path is best-effort; any failure falls back to the local guide.
    ai_answer = None
    try:
        ai_answer = _call_ai(_system_prompt(lang), message, lang)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, OSError):
        ai_answer = None
    except Exception:  # pragma: no cover - never leak internal errors
        ai_answer = None

    if ai_answer:
        return jsonify(ai_answer), 200

    return jsonify(_local_answer(message, lang)), 200

// ===================== PetWorld Frontend Core =====================
// Change this if your Flask backend runs on a different host/port.
const API_BASE = "http://localhost:5000/api";

function getToken() {
  return localStorage.getItem("pw_token");
}
function getUser() {
  const raw = localStorage.getItem("pw_user");
  return raw ? JSON.parse(raw) : null;
}
function setSession(token, user) {
  localStorage.setItem("pw_token", token);
  localStorage.setItem("pw_user", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("pw_token");
  localStorage.removeItem("pw_user");
}
function requireAuth() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}
function isAdmin() {
  const u = getUser();
  return u && u.role === "admin";
}

async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  } catch (err) {
    throw new Error(
      "Could not reach the PetWorld server. Make sure the Flask backend is running on http://localhost:5000."
    );
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* no JSON body */
  }

  if (res.status === 401) {
    clearSession();
    window.location.href = "index.html";
    return;
  }

  if (!res.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// ---------------- Toast notifications ----------------
function showToast(message, type = "default") {
  let toast = document.getElementById("pw-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "pw-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ---------------- Currency ----------------
function formatPrice(value) {
  return "₹" + Number(value).toLocaleString("en-IN");
}

// ---------------- Password show/hide toggle ----------------
const EYE_OPEN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_CLOSED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.06 20.06 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.06 20.06 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function togglePasswordVisibility(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    iconEl.innerHTML = EYE_CLOSED_SVG;
  } else {
    input.type = "password";
    iconEl.innerHTML = EYE_OPEN_SVG;
  }
}

// Automatically render the eye icon into every toggle-password button
// on the page once it loads (works no matter what placeholder text/emoji
// was left in the button's HTML).
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.innerHTML = EYE_OPEN_SVG;
  });
});

// ---------------- Payment method widget ----------------
// Renders the COD / UPI / Card picker. This is a MOCK payment flow for a
// college project - no real payment gateway is called anywhere.
function paymentSectionHTML(containerId) {
  return `
    <div id="${containerId}">
      <label style="display:block; font-size:13px; font-weight:600; margin-bottom:8px;">Payment Method</label>
      <div class="payment-options">
        <button type="button" class="payment-option active" data-method="COD" onclick="selectPaymentMethod('${containerId}','COD')">
          <span class="icon">💵</span><span class="label">Cash on Delivery</span>
        </button>
        <button type="button" class="payment-option" data-method="UPI" onclick="selectPaymentMethod('${containerId}','UPI')">
          <span class="icon">📱</span><span class="label">UPI</span>
        </button>
        <button type="button" class="payment-option" data-method="Card" onclick="selectPaymentMethod('${containerId}','Card')">
          <span class="icon">💳</span><span class="label">Card</span>
        </button>
      </div>
      <div id="${containerId}-fields"></div>
    </div>
  `;
}

function selectPaymentMethod(containerId, method) {
  const root = document.getElementById(containerId);
  root.querySelectorAll(".payment-option").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === method);
  });
  root.dataset.method = method;

  const fields = document.getElementById(`${containerId}-fields`);
  if (method === "UPI") {
    fields.innerHTML = `
      <div class="payment-details">
        <div class="form-group" style="margin-bottom:0;">
          <label>UPI ID</label>
          <input type="text" id="${containerId}-upi" placeholder="yourname@okhdfcbank">
        </div>
      </div>`;
  } else if (method === "Card") {
    fields.innerHTML = `
      <div class="payment-details">
        <div class="form-group"><label>Name on Card</label><input type="text" id="${containerId}-card-name" placeholder="As printed on card"></div>
        <div class="form-group"><label>Card Number</label><input type="text" id="${containerId}-card-number" placeholder="1234 5678 9012 3456" maxlength="19"></div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;"><label>Expiry (MM/YY)</label><input type="text" id="${containerId}-card-expiry" placeholder="09/28" maxlength="5"></div>
          <div class="form-group" style="margin-bottom:0;"><label>CVV</label><input type="password" id="${containerId}-card-cvv" placeholder="123" maxlength="4"></div>
        </div>
      </div>`;
  } else {
    fields.innerHTML = `<p class="helper-text" style="margin-bottom:8px;">Pay with cash when your order arrives.</p>`;
  }
}

/**
 * Reads the current payment selection out of a payment widget.
 * Returns { payment_method, payment_details } or null (+ shows a toast) if invalid.
 */
function getPaymentPayload(containerId) {
  const root = document.getElementById(containerId);
  const method = root.dataset.method || "COD";

  if (method === "UPI") {
    const upi_id = document.getElementById(`${containerId}-upi`).value.trim();
    if (!upi_id.includes("@")) {
      showToast("Please enter a valid UPI ID (e.g. name@bank).", "error");
      return null;
    }
    return { payment_method: "UPI", payment_details: { upi_id } };
  }

  if (method === "Card") {
    const card_name = document.getElementById(`${containerId}-card-name`).value.trim();
    const card_number = document.getElementById(`${containerId}-card-number`).value.trim();
    const expiry = document.getElementById(`${containerId}-card-expiry`).value.trim();
    const cvv = document.getElementById(`${containerId}-card-cvv`).value.trim();
    if (card_number.replace(/\s+/g, "").length < 13 || !/^\d{2}\/\d{2}$/.test(expiry) || cvv.length < 3 || !card_name) {
      showToast("Please fill in valid card details.", "error");
      return null;
    }
    return { payment_method: "Card", payment_details: { card_name, card_number, expiry, cvv } };
  }

  return { payment_method: "COD", payment_details: {} };
}

// ---------------- Karnataka city dropdown ----------------
const KARNATAKA_CITIES = [
  "Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Dharwad", "Belagavi",
  "Kalaburagi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga",
  "Tumakuru", "Udupi", "Hassan", "Mandya", "Kolar", "Chikkamagaluru",
  "Chitradurga", "Raichur", "Bidar", "Bagalkot", "Gadag", "Haveri",
  "Koppal", "Yadgir", "Ramanagara", "Chamarajanagar", "Kodagu", "Uttara Kannada",
];

function karnatakaCityOptionsHTML(selected = "Bengaluru") {
  return `<option value="">Select city…</option>` + KARNATAKA_CITIES.map(
    (c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`
  ).join("");
}

// ---------------- Shared header injector ----------------
function renderTopbar(activePage = "") {
  const el = document.getElementById("topbar");
  if (!el) return;
  const cartCount = parseInt(localStorage.getItem("pw_cart_count") || "0", 10);
  el.innerHTML = `
    <div class="container topbar">
      <div class="topbar-left">
        <a href="favourites.html" class="icon-btn">❤ Favourites</a>
        <a href="cart.html" class="icon-btn">🛒 Cart<span class="badge" id="cart-badge" style="display:${cartCount ? "flex" : "none"}">${cartCount}</span></a>
        <a href="account.html" class="icon-btn">👤 Account</a>
      </div>
      <a href="home.html" class="brand-logo">🐾 PetWorld</a>
    </div>
  `;
}

async function refreshCartBadge() {
  try {
    const data = await api("/cart");
    const count = data.items.reduce((sum, i) => sum + i.quantity, 0);
    localStorage.setItem("pw_cart_count", count);
    const badge = document.getElementById("cart-badge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count ? "flex" : "none";
    }
  } catch (e) {
    /* ignore if not logged in */
  }
}
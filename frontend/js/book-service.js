requireCustomer();
renderTopbar("services");
refreshCartBadge();

const params = new URLSearchParams(window.location.search);
const serviceId = parseInt(params.get("service_id"), 10);
const BENGALURU_CENTER = [12.9716, 77.5946];

let service = null;
let mode = "store";
let map = null;
let marker = null;
let selected = { lat: null, lng: null, inBengaluru: false, checking: false };
let quoteTimer = null;
let lastQuote = null;

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------- setup */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildTimeSlots() {
  const sel = $("time");
  const previous = sel.value;
  const isToday = $("date").value === localToday();
  const now = new Date();
  let html = "";
  for (let h = 9; h <= 18; h++) {
    for (const m of [0, 30]) {
      if (h === 18 && m === 30) continue;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const past = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()));
      const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
      html += `<option value="${value}" ${past ? "disabled" : ""}>${label}</option>`;
    }
  }
  sel.innerHTML = html;
  const prevOption = previous ? sel.querySelector(`option[value="${previous}"]`) : null;
  if (previous && !(prevOption && prevOption.disabled)) sel.value = previous;
  else sel.value = (Array.from(sel.options).find(o => !o.disabled) || {}).value || "";
}

async function init() {
  if (!serviceId) { window.location.href = "services.html"; return; }
  try {
    const all = await api("/services");
    service = all.find(s => s.id === serviceId);
    if (!service) { window.location.href = "services.html"; return; }
    const pageTitle = $("page-title");
    pageTitle.removeAttribute("data-i18n");
    pageTitle.textContent = "";
    const bookPrefix = document.createElement("span");
    setI18nText(bookPrefix, "book_service.book_prefix", "Book:");
    pageTitle.appendChild(bookPrefix);
    pageTitle.appendChild(document.createTextNode(" " + service.service_name));
  } catch (err) {
    showToast(err.message, "error");
    return;
  }
  $("date").min = localToday();
  $("date").value = localToday();
  buildTimeSlots();

  $("date").addEventListener("change", () => { buildTimeSlots(); updateConfirmState(); });
  ["time", "duration", "dogs", "provider"].forEach(id => $(id).addEventListener("change", onOptionChange));
  $("address").addEventListener("input", updateConfirmState);

  $("confirm-btn").removeAttribute("disabled");
  updateConfirmState();

  onOptionChange();
}

function onOptionChange() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(refreshQuote, 150);
  updateConfirmState();
}

/* ------------------------------------------------------- mode */
function setMode(newMode) {
  mode = newMode;
  $("mode-store").classList.toggle("active", mode === "store");
  $("mode-home").classList.toggle("active", mode === "home");
  $("home-section").style.display = mode === "home" ? "block" : "none";
  $("provider-group").style.display = mode === "home" ? "block" : "none";
  if (mode === "home") {
    if (!map) initMap();
    setTimeout(() => map.invalidateSize(), 150);
    setTimeout(maybeAutoDetectLocation, 600);
  }
  onOptionChange();
}

/* -------------------------------------------------------- map */
function emojiIcon(emoji) {
  return L.divIcon({ className: "emoji-marker", html: emoji, iconSize: [34, 34], iconAnchor: [17, 17] });
}

function initMap() {
  map = L.map("map").setView(BENGALURU_CENTER, 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.on("click", (e) => setLocation(e.latlng.lat, e.latlng.lng));
}

function focusMap() {
  $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast(t("book_service.map_toast", "Tap anywhere on the map to drop your pin"));
}

function placeMarker(lat, lng) {
  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true, icon: emojiIcon("🏠") }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      setLocation(p.lat, p.lng, false);
    });
  } else {
    marker.setLatLng([lat, lng]);
  }
}

function setLocStatus(kind, key, fallback) {
  const el = $("loc-status");
  el.className = "loc-status " + kind;
  setI18nText(el, key, fallback);
}

async function reverseGeocode(lat, lng) {
  try {
    // accept-language=en forces English place names/addresses instead of
    // the local-language (Kannada) names OpenStreetMap sometimes returns
    // for locations in Karnataka.
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch (e) {
    return null;
  }
}

async function setLocation(lat, lng, moveMap = true) {
  selected = { lat, lng, inBengaluru: false, checking: true };
  placeMarker(lat, lng);
  if (moveMap) map.setView([lat, lng], 16);
  setLocStatus("wait", "book_service.loc_checking", "Checking your location…");
  updateConfirmState();

  const [check, address] = await Promise.all([
    api("/service-bookings/check-location", { method: "POST", body: { latitude: lat, longitude: lng } })
      .catch(() => null),
    reverseGeocode(lat, lng),
  ]);

  // ignore if the user already moved the pin again
  if (selected.lat !== lat || selected.lng !== lng) return;

  $("address").value = address || `Latitude ${lat.toFixed(5)}, Longitude ${lng.toFixed(5)}`;
  selected.checking = false;
  if (!check) {
    setLocStatus("err", "book_service.loc_fail", "Could not verify your location. Please try again.");
  } else if (check.in_bengaluru) {
    selected.inBengaluru = true;
    setLocStatus("ok", "book_service.loc_ok", "✔ Your location is within Bengaluru.");
  } else {
    setLocStatus("err", "book_service.loc_outside", "Home service is currently available only within Bengaluru.");
  }
  updateConfirmState();
}

function useMyLocation() {
  detectCurrentLocation();
}

function detectCurrentLocation() {
  if (!navigator.geolocation) {
    showToast(t("book_service.gps_unsupported", "Your browser does not support GPS location."), "error");
    return;
  }
  const btn = $("btn-gps");
  btn.disabled = true;
  setI18nText(btn, "book_service.getting_location", "Getting location…");
  setLocStatus("wait", "book_service.loc_detecting", "Detecting your current location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      setI18nText(btn, "book_service.use_location", "🎯 Use My Current Location");
      setLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      btn.disabled = false;
      setI18nText(btn, "book_service.use_location", "🎯 Use My Current Location");
      if (err.code === 1) {
        setLocStatus("err", "book_service.gps_denied", "Location permission was denied. Allow location access, or pick a point on the map.");
      } else {
        setLocStatus("err", "book_service.gps_failed", "Could not get your location. Please pick a point on the map.");
      }
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

let locationAutoAsked = false;

async function maybeAutoDetectLocation() {
  if (locationAutoAsked || mode !== "home" || !navigator.geolocation) return;
  locationAutoAsked = true;
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const permState = await navigator.permissions.query({ name: "geolocation" });
      if (permState.state === "denied") {
        setLocStatus("err", "book_service.gps_denied", "Location permission was denied. Allow location access, or pick a point on the map.");
        return;
      }
    }
  } catch (e) { /* permissions API unavailable -> just try */ }
  detectCurrentLocation();
}

/* ------------------------------------------------------ price */
async function refreshQuote() {
  if (!service) return;
  try {
    const q = await api("/service-bookings/quote", {
      method: "POST",
      body: {
        service_id: service.id,
        service_mode: mode,
        duration_hours: parseFloat($("duration").value),
        number_of_dogs: parseInt($("dogs").value, 10),
      },
    });
    lastQuote = q;
    const durHours = $("duration").value;
    const durUnit = parseFloat(durHours) === 1 ? t("common.hour", "hr") : t("common.hours", "hr");
    const rows = [
      `<div class="summary-row"><span data-i18n="book_service.rate_hour">Rate per hour (1st dog)</span><span>${formatPrice(q.hourly_rate)}</span></div>`,
      `<div class="summary-row"><span><span data-i18n="book_service.first_dog">1st dog ×</span> ${durHours} ${durUnit}</span><span>${formatPrice(q.first_dog)}</span></div>`,
    ];
    if (q.additional_dogs > 0) rows.push(`<div class="summary-row"><span data-i18n="book_service.extra_dogs">Additional dogs (70% each)</span><span>${formatPrice(q.additional_dogs)}</span></div>`);
    if (q.travel_fee > 0) rows.push(`<div class="summary-row"><span data-i18n="book_service.home_visit_fee">Home visit fee</span><span>${formatPrice(q.travel_fee)}</span></div>`);
    rows.push(`<div class="summary-total"><span data-i18n="common.total">Total</span><span>${formatPrice(q.total)}</span></div>`);
    $("price-box").innerHTML = rows.join("");
  } catch (err) {
    lastQuote = null;
    $("price-box").innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* --------------------------------------------------- confirm */
function bookingValidationMessages() {
  const msgs = [];
  if (!$("date").value) msgs.push(t("book_service.err_date", "Please select a date."));
  if (!$("time").value) msgs.push(t("book_service.err_time", "Please select a time."));
  if (mode === "home") {
    if (!selected.lat || !selected.lng) {
      msgs.push(t("book_service.err_location", "Please select your location for home service."));
    } else if (selected.checking) {
      msgs.push(t("book_service.loc_detecting", "Detecting your current location…"));
    } else if (!selected.inBengaluru) {
      msgs.push(t("book_service.loc_outside", "Home service is currently available only within Bengaluru."));
    } else if ($("address").value.trim().length < 5) {
      msgs.push(t("book_service.err_address", "Please provide your address."));
    }
  }
  return msgs;
}

function updateConfirmState() {
  const msgs = bookingValidationMessages();
  $("book-error").textContent = msgs.length
    ? t("book_service.err_required_prefix", "Almost there:") + " " + msgs.join(" ")
    : "";
}

async function confirmBooking() {
  const errorEl = $("book-error");
  errorEl.textContent = "";
  const btn = $("confirm-btn");

  const msgs = bookingValidationMessages();
  if (msgs.length) {
    errorEl.textContent = msgs.join(" ");
    return;
  }

  setI18nText(btn, "book_service.booking_now", "Booking…");

  const body = {
    service_id: service.id,
    service_mode: mode,
    date: $("date").value,
    time: $("time").value,
    duration_hours: parseFloat($("duration").value),
    number_of_dogs: parseInt($("dogs").value, 10),
  };
  if (mode === "home") {
    body.latitude = selected.lat;
    body.longitude = selected.lng;
    body.address = $("address").value.trim();
    body.provider_gender = $("provider").value;
  }

  const payment = getPaymentPayload("sb-payment");
  if (!payment) { setI18nText(btn, "book_service.confirm_booking", "Confirm Booking"); return; }
  Object.assign(body, payment);

  try {
    const data = await api("/service-bookings", { method: "POST", body });
    showToast(t("book_service.booking_confirmed", "Booking confirmed!"), "success");
    showSuccessPanel(data.booking);
  } catch (err) {
    errorEl.textContent = err.message;
    setI18nText(btn, "book_service.confirm_booking", "Confirm Booking");
  }
}

function showSuccessPanel(booking) {
  const panel = $("book-success");
  const dogs = parseInt(booking.number_of_dogs, 10) || 1;
  const petLabel = dogs === 1 ? t("common.dog", "dog") : t("common.dogs", "dogs");
  $("success-service").textContent = booking.service_name;
  $("success-pet").textContent = `${dogs} ${petLabel}`;
  $("success-date").textContent = booking.date;
  $("success-time").textContent = booking.time;
  $("success-status").textContent = booking.status;
  $("success-id").textContent = booking.booking_id;
  $("success-price").textContent = formatPrice(booking.price);
  setI18nText($("success-message"), "book_success.message", "Your service has been booked successfully.");

  const isHome = booking.service_mode === "home";
  $("success-track").style.display = isHome ? "inline-block" : "none";

  $("success-view-bookings").onclick = () => { window.location.href = "bookings.html"; };
  $("success-track").onclick = () => { window.location.href = `track-service.html?id=${booking.id}`; };
  let redirected = false;
  const go = () => {
    if (redirected) return;
    redirected = true;
    window.location.href = isHome ? `track-service.html?id=${booking.id}` : "bookings.html";
  };
  $("success-close").onclick = go;
  setTimeout(go, 5000);

  panel.style.display = "flex";
  document.body.style.overflow = "hidden";
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

init();
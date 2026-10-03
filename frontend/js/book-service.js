requireAuth();
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
  if (previous && !sel.querySelector(`option[value="${previous}"]`)?.disabled) sel.value = previous;
  else sel.value = (Array.from(sel.options).find(o => !o.disabled) || {}).value || "";
}

async function init() {
  if (!serviceId) { window.location.href = "services.html"; return; }
  try {
    const all = await api("/services");
    service = all.find(s => s.id === serviceId);
    if (!service) { window.location.href = "services.html"; return; }
    $("page-title").textContent = `Book: ${service.service_name}`;
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
  showToast("Tap anywhere on the map to drop your pin");
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

function setLocStatus(kind, text) {
  const el = $("loc-status");
  el.className = "loc-status " + kind;
  el.textContent = text;
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
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
  setLocStatus("wait", "Checking your location…");
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
    setLocStatus("err", "Could not verify your location. Please try again.");
  } else if (check.in_bengaluru) {
    selected.inBengaluru = true;
    setLocStatus("ok", "✔ Your location is within Bengaluru.");
  } else {
    setLocStatus("err", "Home service is currently available only within Bengaluru.");
  }
  updateConfirmState();
}

function useMyLocation() {
  if (!navigator.geolocation) {
    showToast("Your browser does not support GPS location.", "error");
    return;
  }
  const btn = $("btn-gps");
  btn.disabled = true;
  btn.textContent = "Getting location…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      btn.textContent = "🎯 Use My Current Location";
      setLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = "🎯 Use My Current Location";
      const msg = err.code === 1
        ? "Location permission was denied. Allow location access, or pick a point on the map."
        : "Could not get your location. Please pick a point on the map.";
      setLocStatus("err", msg);
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
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
    const rows = [
      `<div class="summary-row"><span>Rate per hour (1st dog)</span><span>${formatPrice(q.hourly_rate)}</span></div>`,
      `<div class="summary-row"><span>1st dog × ${$("duration").value} hr</span><span>${formatPrice(q.first_dog)}</span></div>`,
    ];
    if (q.additional_dogs > 0) rows.push(`<div class="summary-row"><span>Additional dogs (70% each)</span><span>${formatPrice(q.additional_dogs)}</span></div>`);
    if (q.travel_fee > 0) rows.push(`<div class="summary-row"><span>Home visit fee</span><span>${formatPrice(q.travel_fee)}</span></div>`);
    rows.push(`<div class="summary-total"><span>Total</span><span>${formatPrice(q.total)}</span></div>`);
    $("price-box").innerHTML = rows.join("");
  } catch (err) {
    lastQuote = null;
    $("price-box").innerHTML = `<p class="error-text">${err.message}</p>`;
  }
}

/* --------------------------------------------------- confirm */
function updateConfirmState() {
  let ok = !!($("date").value && $("time").value);
  if (mode === "home") {
    ok = ok && selected.inBengaluru && !selected.checking && $("address").value.trim().length >= 5;
  }
  $("confirm-btn").disabled = !ok;
}

async function confirmBooking() {
  const errorEl = $("book-error");
  errorEl.textContent = "";
  const btn = $("confirm-btn");
  btn.disabled = true;
  btn.textContent = "Booking…";

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
  if (!payment) { btn.disabled = false; btn.textContent = "Confirm Booking"; return; }
  Object.assign(body, payment);

  try {
    const data = await api("/service-bookings", { method: "POST", body });
    showToast("Booking confirmed!", "success");
    setTimeout(() => {
      window.location.href = mode === "home"
        ? `track-service.html?id=${data.booking.id}`
        : "bookings.html";
    }, 900);
  } catch (err) {
    errorEl.textContent = err.message;
    btn.textContent = "Confirm Booking";
    updateConfirmState();
  }
}

init();

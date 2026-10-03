requireAuth();
renderTopbar("services");
refreshCartBadge();

const bookingId = new URLSearchParams(window.location.search).get("id");
const STEPS = ["Booking Confirmed", "Employee Assigned", "On the Way", "Arrived", "Service Started", "Service Completed"];
const $ = (id) => document.getElementById(id);

let map = null, homeMarker = null, carMarker = null, fitted = false, timer = null;

function emojiIcon(emoji) {
  return L.divIcon({ className: "emoji-marker", html: emoji, iconSize: [36, 36], iconAnchor: [18, 18] });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function initMap(lat, lng) {
  map = L.map("map").setView([lat, lng], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  homeMarker = L.marker([lat, lng], { icon: emojiIcon("🏠") }).addTo(map).bindPopup("Your location");
}

function renderDetails(b) {
  const hrs = b.duration_hours === 1 ? "1 hour" : `${b.duration_hours} hours`;
  $("details").innerHTML = [
    ["Booking ID", b.booking_id],
    ["Service", b.service_name],
    ["Employee", b.employee_name ? `${b.employee_name}${b.employee_phone ? " · " + b.employee_phone : ""}` : "—"],
    ["Date", b.date],
    ["Time", b.time],
    ["Number of dogs", b.number_of_dogs],
    ["Duration", hrs],
    ["Price", formatPrice(b.price)],
    ["Address", b.address || "—"],
  ].map(([k, v]) => `<div class="detail-row"><span>${k}</span><span>${v}</span></div>`).join("");
}

function renderSteps(status) {
  const idx = STEPS.indexOf(status);
  $("steps").innerHTML = STEPS.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const dot = i <= idx ? "✓" : "";
    return `<li class="${cls}"><span class="dot">${dot}</span>${s}</li>`;
  }).join("");
}

function renderBanner(d) {
  const b = d.booking;
  const banner = $("banner");
  banner.className = "live-banner";
  const name = b.employee_name || "Your employee";
  switch (b.status) {
    case "Booking Confirmed": banner.textContent = "✅ Booking confirmed. Waiting for the employee to accept."; break;
    case "Employee Assigned": banner.textContent = `👤 ${name} has accepted your booking and will start travelling soon.`; break;
    case "On the Way": banner.textContent = `🚗 ${name} is on the way to your home!`; banner.classList.add("green"); break;
    case "Arrived": banner.textContent = `📍 ${name} has arrived at your location.`; banner.classList.add("green"); break;
    case "Service Started": banner.textContent = `✂️ Your service has started.`; banner.classList.add("green"); break;
    case "Service Completed": banner.textContent = "🎉 Service completed. Thank you for choosing PetWorld!"; banner.classList.add("green"); break;
    default: banner.textContent = b.status;
  }
}

function renderTracking(d) {
  const b = d.booking;
  renderDetails(b);
  renderSteps(b.status);
  renderBanner(d);

  if (!map) initMap(b.latitude, b.longitude);

  const loc = d.employee_location;
  if (d.tracking_active && loc) {
    const pos = [loc.latitude, loc.longitude];
    if (!carMarker) carMarker = L.marker(pos, { icon: emojiIcon("🚗") }).addTo(map).bindPopup(`${b.employee_name || "Employee"}`);
    else carMarker.setLatLng(pos);

    if (!fitted) {
      map.fitBounds([[b.latitude, b.longitude], pos], { padding: [50, 50] });
      fitted = true;
    }
    const km = haversineKm(loc.latitude, loc.longitude, b.latitude, b.longitude);
    const away = km < 0.05 ? "Employee is at your location" : `Employee is about ${km.toFixed(1)} km away`;
    $("distance-line").textContent = `${away} · updated ${loc.seconds_ago}s ago`;
  } else {
    if (carMarker) { map.removeLayer(carMarker); carMarker = null; }
    $("distance-line").textContent = b.status === "Service Completed"
      ? "Live tracking has ended."
      : "Live location will appear here once the employee starts travelling.";
  }

  if (b.status === "Service Completed" && timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function loadTracking() {
  try {
    renderTracking(await api(`/service-bookings/${bookingId}/tracking`));
  } catch (err) {
    $("banner").textContent = err.message;
    $("banner").className = "live-banner";
    if (timer) { clearInterval(timer); timer = null; }
  }
}

if (!bookingId) {
  window.location.href = "bookings.html";
} else {
  loadTracking();
  timer = setInterval(loadTracking, 5000);
}

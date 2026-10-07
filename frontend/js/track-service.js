requireCustomer();
renderTopbar("services");
refreshCartBadge();

const bookingId = new URLSearchParams(window.location.search).get("id");
const STEPS = ["Booking Confirmed", "Employee Assigned", "On the Way", "Arrived", "Service Started", "Service Completed"];
const STEP_KEYS = ["track.step_confirmed", "track.step_assigned", "track.step_on_way", "track.step_arrived", "track.step_started", "track.step_completed"];
const $ = (id) => document.getElementById(id);

function setStatusText(el, parts) {
  el.removeAttribute("data-i18n");
  el.textContent = "";
  for (const part of parts) {
    if (typeof part === "string") {
      el.appendChild(document.createTextNode(part));
    } else {
      const span = document.createElement("span");
      setI18nText(span, part[0], part[1]);
      el.appendChild(span);
    }
  }
}

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
  homeMarker = L.marker([lat, lng], { icon: emojiIcon("🏠") }).addTo(map).bindPopup(`<span data-i18n="track.your_location">Your location</span>`);
}

function renderDetails(b) {
  const hrs = b.duration_hours === 1
    ? `${b.duration_hours} ${t("common.hour", "hour")}`
    : `${b.duration_hours} ${t("common.hours", "hours")}`;
  const rows = [
    ["admin.th_booking_id", "Booking ID", b.booking_id],
    ["admin.th_service", "Service", b.service_name],
    ["track.employee", "Employee", b.employee_name ? `${b.employee_name}${b.employee_phone ? " · " + b.employee_phone : ""}` : "—"],
    ["book_service.date", "Date", b.date],
    ["book_service.time", "Time", b.time],
    ["book_service.dogs_label", "Number of dogs", b.number_of_dogs],
    ["book_service.duration", "Duration", hrs],
    ["common.price", "Price", formatPrice(b.price)],
    ["book_service.address", "Address", b.address || "—"],
  ];
  $("details").innerHTML = rows
    .map(([key, label, value]) => `<div class="detail-row"><span data-i18n="${key}">${label}</span><span>${value}</span></div>`)
    .join("");
}

function renderSteps(status) {
  const idx = STEPS.indexOf(status);
  $("steps").innerHTML = STEPS.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const dot = i <= idx ? "✓" : "";
    return `<li class="${cls}"><span class="dot">${dot}</span><span data-i18n="${STEP_KEYS[i]}">${s}</span></li>`;
  }).join("");
}

function renderBanner(d) {
  const b = d.booking;
  const banner = $("banner");
  banner.className = "live-banner";
  const name = b.employee_name || t("track.your_employee", "Your employee");
  switch (b.status) {
    case "Booking Confirmed":
      setStatusText(banner, [["track.banner_confirmed", "✅ Booking confirmed. Waiting for the employee to accept."]]);
      break;
    case "Employee Assigned":
      setStatusText(banner, [`👤 ${name} `, ["track.banner_assigned", "has accepted your booking and will start travelling soon."]]);
      break;
    case "On the Way":
      setStatusText(banner, [`🚗 ${name} `, ["track.banner_on_way", "is on the way to your home!"]]);
      banner.classList.add("green");
      break;
    case "Arrived":
      setStatusText(banner, [`📍 ${name} `, ["track.banner_arrived", "has arrived at your location."]]);
      banner.classList.add("green");
      break;
    case "Service Started":
      setStatusText(banner, [["track.banner_started", "✂️ Your service has started."]]);
      banner.classList.add("green");
      break;
    case "Service Completed":
      setStatusText(banner, [["track.banner_completed", "🎉 Service completed. Thank you for choosing PetWorld!"]]);
      banner.classList.add("green");
      break;
    default:
      setStatusText(banner, [b.status]);
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
    if (!carMarker) carMarker = L.marker(pos, { icon: emojiIcon("🚗") }).addTo(map).bindPopup(b.employee_name || `<span data-i18n="track.employee">Employee</span>`);
    else carMarker.setLatLng(pos);

    if (!fitted) {
      map.fitBounds([[b.latitude, b.longitude], pos], { padding: [50, 50] });
      fitted = true;
    }
    const km = haversineKm(loc.latitude, loc.longitude, b.latitude, b.longitude);
    const away = km < 0.05
      ? t("track.emp_at_location", "Employee is at your location")
      : t("track.emp_away", "Employee is about {km} km away").replace("{km}", km.toFixed(1));
    $("distance-line").textContent = `${away} · ${t("track.updated_ago", "updated {s}s ago").replace("{s}", loc.seconds_ago)}`;
  } else {
    if (carMarker) { map.removeLayer(carMarker); carMarker = null; }
    setStatusText($("distance-line"), [
      b.status === "Service Completed"
        ? ["track.live_ended", "Live tracking has ended."]
        : ["track.live_wait", "Live location will appear here once the employee starts travelling."],
    ]);
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
    setStatusText($("banner"), [err.message]);
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

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

let map = null, homeMarker = null, carMarker = null, fitted = false, viewSet = false, timer = null;
// The customer's service location, resolved from saved coordinates or, for a
// manual address, from geocoding. null means "no usable coordinates".
let customerLatLng = null, customerResolved = false, geocoding = false;

// A coordinate is only usable when both values are real finite numbers.
// The API returns null for manual bookings that were saved without a pin.
function validCoord(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) &&
         typeof lng === "number" && Number.isFinite(lng);
}

function emojiIcon(emoji) {
  return L.divIcon({ className: "emoji-marker", html: emoji, iconSize: [36, 36], iconAnchor: [18, 18] });
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function setMapMessage(key, fallback) {
  const box = $("map-message");
  if (!box) return;
  setI18nText(box, key, fallback);
  box.style.display = "";
}

function clearMapMessage() {
  const box = $("map-message");
  if (box) box.style.display = "none";
}

// Forward-geocode a saved address (Nominatim, same service the booking page
// already uses for reverse geocoding). Returns [lat, lng] or null - it never
// invents a location.

// Pure helper: turn a saved multi-line address into a short list of queries to
// try, most specific first. The landmark line is dropped (free text hurts
// accuracy) and stray/duplicate commas are collapsed so a stray trailing comma
// cannot break the query. Kept separate from the network call so it can be
// tested on its own.
function geocodeQueries(address) {
  const lines = String(address)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\s*landmark\s*:/i.test(l));
  if (!lines.length) return [];

  const collapse = (parts) => parts
    .join(",")
    .replace(/(?:\s*,\s*)+/g, ", ")
    .replace(/^,\s*/, "")
    .replace(/,\s*$/, "")
    .trim();

  const queries = [];
  // Always keep at least two lines (e.g. street + city). Never fall back to the
  // city alone, because a city-centre point would mislead the customer.
  for (let drop = 0; drop <= lines.length - 2 && queries.length < 3; drop++) {
    const q = collapse(lines.slice(drop));
    if (q && !queries.includes(q)) queries.push(q);
  }
  return queries;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocodeAddress(address) {
  const queries = geocodeQueries(address);
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=1&accept-language=en`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          if (validCoord(lat, lng)) return [lat, lng];
        }
      }
    } catch (e) {
      /* fall through to the next (less specific) query */
    }
    // Nominatim allows ~1 request per second; pace the fallbacks.
    if (i < queries.length - 1) await sleep(1100);
  }
  return null;
}

// Work out where the customer's service location is. Prefer saved coordinates;
// fall back to geocoding the address once per page load.
async function resolveCustomerLocation(b) {
  if (customerResolved) return;
  if (validCoord(b.latitude, b.longitude)) {
    customerLatLng = [b.latitude, b.longitude];
    customerResolved = true;
    return;
  }
  customerResolved = true; // only ever attempt geocoding once
  if (!b.address) return;
  geocoding = true;
  setMapMessage("track.map_locating", "Locating the service address on the map…");
  customerLatLng = await geocodeAddress(b.address);
  geocoding = false;
}

// Draw whatever locations are actually available. Either marker may be
// missing; both missing shows a message instead of a grey, broken map.
function updateMap(b, empLoc) {
  const home = customerLatLng;
  const emp = empLoc ? [empLoc.latitude, empLoc.longitude] : null;
  const mapEl = $("map");

  if (!home && !emp) {
    if (map) {
      map.remove();
      map = homeMarker = carMarker = null;
      fitted = viewSet = false;
    }
    mapEl.style.display = "none";
    if (geocoding) setMapMessage("track.map_locating", "Locating the service address on the map…");
    else setMapMessage("track.map_unavailable", "Map location is unavailable for this address.");
    return;
  }

  mapEl.style.display = "";
  clearMapMessage();

  if (!map) {
    map = L.map("map").setView(home || emp, 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  }

  if (home) {
    if (!homeMarker) homeMarker = L.marker(home, { icon: emojiIcon("🏠") }).addTo(map)
      .bindPopup(`<span data-i18n="track.your_location">Your location</span>`);
    else homeMarker.setLatLng(home);
  } else if (homeMarker) {
    map.removeLayer(homeMarker);
    homeMarker = null;
  }

  if (emp) {
    if (!carMarker) carMarker = L.marker(emp, { icon: emojiIcon("🚗") }).addTo(map)
      .bindPopup(b.employee_name || `<span data-i18n="track.employee">Employee</span>`);
    else carMarker.setLatLng(emp);
  } else if (carMarker) {
    map.removeLayer(carMarker);
    carMarker = null;
  }

  // Fit both markers once they are known; otherwise centre on the one we have
  // and re-fit when the other turns up.
  if (home && emp) {
    if (!fitted) { map.fitBounds([home, emp], { padding: [50, 50] }); fitted = true; }
  } else if (!fitted && !viewSet) {
    map.setView(home || emp, 15);
    viewSet = true;
  }
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

async function renderTracking(d) {
  const b = d.booking;
  renderDetails(b);
  renderSteps(b.status);
  renderBanner(d);

  // Resolve the customer's service location before touching the map, so a
  // manual address without coordinates can be geocoded or shown as unavailable
  // instead of being passed to Leaflet as null.
  await resolveCustomerLocation(b);

  const loc = d.employee_location;
  const empActive = !!(d.tracking_active && loc && validCoord(loc.latitude, loc.longitude));
  updateMap(b, empActive ? loc : null);

  if (empActive) {
    const updated = t("track.updated_ago", "updated {s}s ago").replace("{s}", loc.seconds_ago);
    if (customerLatLng) {
      const km = haversineKm(loc.latitude, loc.longitude, customerLatLng[0], customerLatLng[1]);
      const away = km < 0.05
        ? t("track.emp_at_location", "Employee is at your location")
        : t("track.emp_away", "Employee is about {km} km away").replace("{km}", km.toFixed(1));
      $("distance-line").textContent = `${away} · ${updated}`;
    } else {
      $("distance-line").textContent = updated;
    }
  } else {
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
    await renderTracking(await api(`/service-bookings/${bookingId}/tracking`));
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

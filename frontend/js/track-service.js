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

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    .map(([key, label, value]) => `<div class="detail-row"><span data-i18n="${key}">${label}</span><span>${escapeHtml(value)}</span></div>`)
    .join("");
}

function renderSteps(status) {
  const idx = STEPS.indexOf(status);
  if (idx < 0) {
    $("steps").innerHTML = `<li class="current"><span class="dot">!</span><span>${escapeHtml(status || "—")}</span></li>`;
    return;
  }
  $("steps").innerHTML = STEPS.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const dot = i <= idx ? "✓" : "";
    return `<li class="${cls}"><span class="dot">${dot}</span><span data-i18n="${STEP_KEYS[i]}">${s}</span></li>`;
  }).join("");
}

// The backend derives these fields from the saved booking status. The fallback
// keeps the page correct if an older API response is cached in the browser.
function employeeState(b) {
  const assigned = typeof b.employee_assigned === "boolean"
    ? b.employee_assigned
    : !!b.employee_name;
  let assignment = b.assignment_status;
  let travel = b.travel_status;

  if (!assignment) {
    if (!assigned) assignment = "not_assigned";
    else if (b.status === "Booking Confirmed") assignment = "awaiting_acceptance";
    else if (b.status === "Service Completed") assignment = "completed";
    else if (b.status === "Cancelled") assignment = "cancelled";
    else assignment = "accepted";
  }
  if (!travel) {
    travel = {
      "Booking Confirmed": "not_started",
      "Employee Assigned": "not_travelling",
      "On the Way": "travelling",
      "Arrived": "arrived",
      "Service Started": "in_service",
      "Service Completed": "completed",
      "Cancelled": "cancelled",
    }[b.status] || "not_travelling";
  }

  const accepted = typeof b.employee_accepted === "boolean"
    ? b.employee_accepted
    : ["accepted", "completed"].includes(assignment);

  return { assigned, accepted, assignment, travel };
}

function assignmentLabel(state) {
  switch (state.assignment) {
    case "not_assigned": return t("track.assignment_not_assigned", "Not Assigned");
    case "awaiting_acceptance": return t("track.assignment_awaiting", "Awaiting Acceptance");
    case "accepted": return t("track.assignment_accepted", "Booking Accepted");
    case "completed": return t("track.assignment_completed", "Completed");
    case "cancelled": return t("track.assignment_cancelled", "Cancelled");
    default: return state.assignment || "—";
  }
}

function travelLabel(state) {
  switch (state.travel) {
    case "not_started": return t("track.travel_not_started", "Not Started");
    case "not_travelling": return t("track.travel_not_yet", "Not Yet Travelling");
    case "travelling": return t("track.travel_travelling", "Travelling to your location");
    case "arrived": return t("track.travel_arrived", "Arrived");
    case "in_service": return t("track.travel_in_service", "Service in Progress");
    case "completed": return t("track.travel_completed", "Completed");
    case "cancelled": return t("track.travel_cancelled", "Cancelled");
    default: return state.travel || "—";
  }
}

function employeeSummary(state) {
  if (!state.assigned) {
    return ["track.employee_not_assigned", "Employee has not been assigned yet."];
  }
  if (!state.accepted) {
    return ["track.employee_awaiting_acceptance", "Employee assigned — waiting for them to accept the booking."];
  }
  switch (state.travel) {
    case "travelling":
      return ["track.employee_travelling", "Employee is on the way to your location."];
    case "arrived":
      return ["track.employee_arrived", "Employee has arrived at your location."];
    case "in_service":
      return ["track.employee_in_service", "The employee has arrived and your service is in progress."];
    case "completed":
      return ["track.employee_completed", "Service completed. Thank you for choosing PetWorld!"];
    case "cancelled":
      return ["track.employee_cancelled", "This booking has been cancelled."];
    default:
      return ["track.employee_accepted_not_travelling", "Booking accepted — employee has not started travelling yet."];
  }
}

function badgeClass(status) {
  if (status === "Service Completed") return "done";
  if (status === "On the Way" || status === "Arrived" || status === "Service Started") return "live";
  if (status === "Employee Assigned") return "accepted";
  return "missing";
}

function renderEmployeeDetails(b) {
  const wrap = $("employee-details");
  const badge = $("employee-badge");
  if (!wrap) return;
  const state = employeeState(b);

  if (badge) {
    badge.textContent = b.status || "—";
    badge.className = "employee-status-badge " + badgeClass(b.status);
  }

  const [summaryKey, summaryFallback] = employeeSummary(state);
  const summary = document.createElement("p");
  summary.className = "employee-note";
  if (state.assigned && ["travelling", "arrived", "in_service", "completed"].includes(state.travel)) {
    summary.classList.add("green");
  }
  setI18nText(summary, summaryKey, summaryFallback);

  if (!state.assigned) {
    wrap.innerHTML = "";
    wrap.appendChild(summary);
    return;
  }

  const rows = [
    ["track.employee_name", "Name", b.employee_name || "—"],
    ["track.employee_phone", "Phone", b.employee_phone || "—"],
    ["track.employee_assignment_status", "Status", assignmentLabel(state)],
    ["track.employee_travel_status", "Travel Status", travelLabel(state)],
  ];
  const grid = document.createElement("div");
  grid.className = "employee-grid";
  grid.innerHTML = rows
    .map(([key, label, value]) => `<div class="detail-row"><span data-i18n="${key}">${label}</span><span>${escapeHtml(value)}</span></div>`)
    .join("");

  wrap.innerHTML = "";
  wrap.appendChild(summary);
  wrap.appendChild(grid);
}

async function renderTracking(d) {
  const b = d.booking;
  renderDetails(b);
  renderSteps(b.status);
  renderEmployeeDetails(b);

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
      // distance-line removed from UI
    } else {
      // distance-line removed from UI
    }
  } else {
    // distance-line removed from UI
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
    const wrap = $("employee-details");
    if (wrap) {
      wrap.innerHTML = `<p class="employee-note error"></p>`;
      wrap.firstElementChild.textContent = err.message;
    }
    const badge = $("employee-badge");
    if (badge) {
      badge.textContent = "—";
      badge.className = "employee-status-badge missing";
    }
    if (timer) { clearInterval(timer); timer = null; }
  }
}

if (!bookingId) {
  window.location.href = "bookings.html";
} else {
  loadTracking();
  timer = setInterval(loadTracking, 5000);
}

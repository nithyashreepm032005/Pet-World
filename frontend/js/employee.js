
/* Employee dashboard - uses its own token so it never mixes with customer login. */
const EMP_TOKEN = "pw_emp_token";
const EMP_NAME = "pw_emp_name";
const ACTIVE = ["On the Way", "Arrived", "Service Started"];
const NEXT = {
  "Booking Confirmed": { action: "accept", label: "✔ Accept Booking" },
  "Employee Assigned": { action: "start-travel", label: "🚗 Start Travel" },
  "On the Way": { action: "arrived", label: "📍 Mark Arrived" },
  "Arrived": { action: "start-service", label: "▶ Start Service" },
  "Service Started": { action: "complete", label: "✅ Complete Service" },
};

const $ = (id) => document.getElementById(id);

let bookings = [];
let selectedId = null;
let map = null, custMarker = null, empMarker = null;
let track = {
  id: null,
  watchId: null,
  timer: null,
  latest: null,
  sim: null,
  cust: null
};
let refreshTimer = null;

/* ------------------------------------------------------- api */
async function empApi(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    headers["Authorization"] = `Bearer ${localStorage.getItem(EMP_TOKEN)}`;
  }

  let res;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
  } catch (e) {
    throw new Error("Could not reach the PetWorld server. Is Flask running?");
  }

  let data = {};

  try {
    data = await res.json();
  } catch (e) {}

  if (res.status === 401 && auth) {
    logout();
    throw new Error("Please log in again.");
  }

  if (!res.ok) {
    throw new Error(data.error || data.msg || "Something went wrong.");
  }

  return data;
}

/* ------------------------------------------------------ login */
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";

  try {
    const data = await empApi("/employee/login", {
      method: "POST",
      auth: false,
      body: {
        email: $("email").value.trim(),
        password: $("password").value
      }
    });

    localStorage.setItem(EMP_TOKEN, data.token);
    localStorage.setItem(EMP_NAME, data.employee.name);

    showDashboard();
  } catch (err) {
    $("login-error").textContent = err.message;
  }
});

function logout() {
  stopTracking();
  clearInterval(refreshTimer);

  localStorage.removeItem(EMP_TOKEN);
  localStorage.removeItem(EMP_NAME);

  $("dash-view").style.display = "none";
  $("login-view").style.display = "flex";
}

function showDashboard() {
  $("login-view").style.display = "none";
  $("dash-view").style.display = "block";

  $("emp-name").textContent =
    "— " + (localStorage.getItem(EMP_NAME) || "");

  if (!map) initMap();

  setTimeout(() => map.invalidateSize(), 150);

  loadBookings();

  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadBookings, 15000);
}

/* ------------------------------------------------------- map */
function emojiIcon(emoji) {
  return L.divIcon({
    className: "emoji-marker",
    html: emoji,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

/* Updated map tiles */
function initMap() {
  map = L.map("emp-map").setView([12.9716, 77.5946], 11);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      subdomains: "abcd",
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  ).addTo(map);
}

function showCustomerOnMap(b) {
  if (!b) return;

  if (custMarker) {
    map.removeLayer(custMarker);
  }

  custMarker = L.marker(
    [b.latitude, b.longitude],
    { icon: emojiIcon("🏠") }
  )
    .addTo(map)
    .bindPopup(`${b.customer_name}<br>${b.address}`);

  const pts = [[b.latitude, b.longitude]];

  if (empMarker) {
    pts.push(empMarker.getLatLng());
  }

  if (pts.length > 1) {
    map.fitBounds(pts, { padding: [40, 40] });
  } else {
    map.setView(pts[0], 15);
  }
}

function updateEmpMarker(pos) {
  if (!empMarker) {
    empMarker = L.marker(
      [pos.lat, pos.lng],
      { icon: emojiIcon("🚗") }
    )
      .addTo(map)
      .bindPopup("You");
  } else {
    empMarker.setLatLng([pos.lat, pos.lng]);
  }
}

/* --------------------------------------------------- bookings */
async function loadBookings() {
  try {
    bookings = await empApi("/employee/bookings");
    renderJobs();
    ensureTracking();
  } catch (err) {
    $("jobs").innerHTML = `
      <div class="empty-state">
        <div class="emoji">⚠️</div>
        <h3>${err.message}</h3>
      </div>`;
  }
}

function renderJobs() {
  if (!bookings.length) {
    $("jobs").innerHTML = `
      <div class="empty-state">
        <div class="emoji">📭</div>
        <h3>No home-service bookings assigned yet</h3>
      </div>`;
    return;
  }

  if (!selectedId || !bookings.find(b => b.id === selectedId)) {
    const first =
      bookings.find(b => b.status !== "Service Completed") || bookings[0];

    selectedId = first.id;
    showCustomerOnMap(first);
  }

  $("jobs").innerHTML = bookings.map(b => {
    const next = NEXT[b.status];
    const pillCls =
      b.status === "Service Completed"
        ? "done"
        : ACTIVE.includes(b.status)
          ? "live"
          : "";

    return `
      <div class="list-card job ${b.id === selectedId ? "selected" : ""}">
        <div class="list-card-head">
          <h4>${b.service_name} · ${b.booking_id}</h4>
          <span class="pill ${pillCls}">${b.status}</span>
        </div>

        <div class="line">
          <span>Customer:</span> ${b.customer_name} · ${b.customer_phone}
        </div>

        <div class="line">
          <span>When:</span> ${b.date} at ${b.time} · ${b.duration_hours} hr
        </div>

        <div class="line">
          <span>Dogs:</span> ${b.number_of_dogs} ·
          <span>Provider:</span> ${b.provider_gender}
        </div>

        <div class="line">
          <span>Address:</span> ${b.address}
        </div>

        <div class="job-actions">
          <button
            class="btn btn-outline btn-sm"
            onclick="selectJob(${b.id})">
            🗺️ View on Map
          </button>

          ${next ? `
            <button
              class="btn btn-primary btn-sm"
              onclick="doAction(${b.id}, '${next.action}')">
              ${next.label}
            </button>
          ` : ""}
        </div>
      </div>`;
  }).join("");
}

function selectJob(id) {
  selectedId = id;
  renderJobs();
  showCustomerOnMap(bookings.find(b => b.id === id));
}

async function doAction(id, action) {
  try {
    await empApi(`/employee/bookings/${id}/${action}`, {
      method: "POST"
    });

    showToast("Status updated", "success");
    await loadBookings();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ------------------------------------------------- GPS tracking */
function gpsStatus(text) {
  $("gps-status").textContent = text;
}

function ensureTracking() {
  const active = bookings.find(b => ACTIVE.includes(b.status));

  if (!active) {
    stopTracking();
    return;
  }

  if (track.id !== active.id) {
    startTracking(active);
  }
}

function startTracking(b) {
  stopTracking();

  track.id = b.id;
  track.cust = {
    lat: b.latitude,
    lng: b.longitude
  };

  if ($("sim-toggle").checked) {
    track.sim = {
      lat: b.latitude + 0.02,
      lng: b.longitude + 0.02
    };

    gpsStatus("Demo mode: simulating travel…");
  } else if (navigator.geolocation) {
    gpsStatus("Getting GPS location…");

    track.watchId = navigator.geolocation.watchPosition(
      (p) => {
        track.latest = {
          lat: p.coords.latitude,
          lng: p.coords.longitude
        };
      },
      (err) => gpsStatus(
        err.code === 1
          ? "GPS permission denied. Allow location access (or use Demo mode)."
          : "Could not read GPS. Try Demo mode."
      ),
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000
      }
    );
  } else {
    gpsStatus("This browser has no GPS. Use Demo mode.");
  }

  track.timer = setInterval(sendLocation, 5000);
  setTimeout(sendLocation, 800);
}

function stopTracking() {
  if (track.watchId !== null) {
    navigator.geolocation.clearWatch(track.watchId);
  }

  if (track.timer) {
    clearInterval(track.timer);
  }

  const wasTracking = track.id !== null;

  track = {
    id: null,
    watchId: null,
    timer: null,
    latest: null,
    sim: null,
    cust: null
  };

  if (wasTracking) {
    gpsStatus("Tracking stopped.");
  }
}

function stepSimulation() {
  const s = track.sim;
  const c = track.cust;

  s.lat += (c.lat - s.lat) * 0.15;
  s.lng += (c.lng - s.lng) * 0.15;

  return {
    lat: s.lat,
    lng: s.lng
  };
}

async function sendLocation() {
  if (track.id === null) return;

  const pos = track.sim ? stepSimulation() : track.latest;

  if (!pos) {
    gpsStatus("Waiting for GPS signal…");
    return;
  }

  try {
    await empApi(`/employee/location/${track.id}`, {
      method: "POST",
      body: {
        latitude: pos.lat,
        longitude: pos.lng
      }
    });

    updateEmpMarker(pos);

    gpsStatus(
      `📡 Sharing live location · last sent ${new Date().toLocaleTimeString()}`
    );
  } catch (err) {
    gpsStatus(err.message);
  }
}

$("sim-toggle").addEventListener("change", () => {
  if (track.id === null) return;

  const b = bookings.find(x => x.id === track.id);

  if (b) startTracking(b);
});

/* ------------------------------------------------------ start */
if (localStorage.getItem(EMP_TOKEN)) {
  showDashboard();
}
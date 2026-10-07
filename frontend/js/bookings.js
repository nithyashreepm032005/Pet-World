requireCustomer();
renderTopbar("bookings");
refreshCartBadge();

const STATUS_COLORS = {
  "Booking Confirmed": ["#fff3cd", "#856404"],
  "Employee Assigned": ["#d1ecf1", "#0c5460"],
  "On the Way": ["#cce5ff", "#004085"],
  "Arrived": ["#e2d9f3", "#432874"],
  "Service Started": ["#d4edda", "#155724"],
  "Service Completed": ["#c3e6cb", "#155724"],
};

async function loadBookings() {
  const el = document.getElementById("bookings-list");
  try {
    const [newOnes, legacy] = await Promise.all([
      api("/service-bookings"),
      api("/bookings").catch(() => []),      // older bookings made before this update
    ]);
    if (!newOnes.length && !legacy.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">🗓️</div><h3>No bookings yet</h3><p>Your grooming and training bookings will show up here.</p><a href="services.html" class="btn btn-primary" style="margin-top:14px;">Book a Service</a></div>`;
      return;
    }
    el.innerHTML = newOnes.map(renderServiceBooking).join("") + legacy.map(renderLegacyBooking).join("");
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderServiceBooking(b) {
  const [bg, fg] = STATUS_COLORS[b.status] || ["#eee", "#333"];
  const isHome = b.service_mode === "home";
  const canTrack = isHome && b.status !== "Service Completed";
  const hrs = b.duration_hours === 1 ? "1 hour" : `${b.duration_hours} hours`;
  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>Booking #${b.booking_id}</h4>
        <span class="status-badge" style="background:${bg}; color:${fg};">${b.status}</span>
      </div>
      <p class="card-meta"><strong>${b.service_name}</strong> — ${isHome ? "🏠 Home Service" : "🏪 Store Service"}</p>
      <p class="card-meta">📅 ${b.date} at 🕐 ${b.time} · ${hrs} · ${b.number_of_dogs} dog${b.number_of_dogs > 1 ? "s" : ""}</p>
      ${isHome ? `<p class="card-meta">📍 ${b.address}</p><p class="card-meta">👤 ${b.employee_name || "Employee will be assigned"} (${b.provider_gender})</p>` : `<p class="card-meta">Bring your pet to the PetWorld store at the booked time.</p>`}
      <p class="card-meta">💳 Paid via: ${b.payment_method || "COD"} ${b.payment_reference ? "(" + b.payment_reference + ")" : ""}</p>
      <div class="summary-total" style="margin:8px 0 0; border:0; padding:0;"><span>Price</span><span>${formatPrice(b.price)}</span></div>
      ${canTrack ? `<a class="btn btn-secondary btn-sm" style="margin-top:12px;" href="track-service.html?id=${b.id}">📍 Track Employee</a>` : ""}
    </div>`;
}

function renderLegacyBooking(b) {
  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>Booking #${b.booking_id}</h4>
        <span class="status-badge status-${b.status}">${b.status}</span>
      </div>
      <p class="card-meta">${b.service} — ${b.package}</p>
      <p class="card-meta">📅 ${b.booking_date} at 🕐 ${b.booking_time}</p>
      <div class="summary-total" style="margin:0; border:0; padding:0;"><span>Price</span><span>${formatPrice(b.price)}</span></div>
    </div>`;
}

loadBookings();

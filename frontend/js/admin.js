// Guard: only logged-in admins may view this page.
if (!getToken() || !isAdmin()) {
  window.location.href = "index.html";
}

document.getElementById("logout-link").addEventListener("click", (e) => {
  e.preventDefault();
  clearSession();
  window.location.href = "index.html";
});

let currentTab = "dogs";
let cachedDogs = [], cachedFood = [], cachedServices = [];

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  renderTab();
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function thumb(src, emoji) {
  if (!src) return `<div style="width:48px;height:48px;border-radius:8px;background:#f0e4d8;display:flex;align-items:center;justify-content:center;font-size:22px;">${emoji}</div>`;
  return `<img src="${src}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;" onerror="this.outerHTML='<div style=&quot;width:48px;height:48px;border-radius:8px;background:#f0e4d8;display:flex;align-items:center;justify-content:center;font-size:22px;&quot;>${emoji}</div>';">`;
}

async function renderTab() {
  const el = document.getElementById("tab-content");
  el.innerHTML = `<div class="spinner"></div>`;
  try {
    if (currentTab === "dogs") await renderDogsTab();
    else if (currentTab === "food") await renderFoodTab();
    else if (currentTab === "services") await renderServicesTab();
    else if (currentTab === "customers") await renderCustomersTab();
    else if (currentTab === "orders") await renderOrdersTab();
    else if (currentTab === "returns") await renderReturnsTab();
    else if (currentTab === "bookings") await renderBookingsTab();
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

// ==================== DOGS ====================
async function renderDogsTab() {
  cachedDogs = await api("/dogs");
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary" onclick="openBreedModal()">+ Add Breed</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Image</th><th>Breed</th><th>Gender</th><th>Color</th><th>Vaccination</th><th>Availability</th><th>Age/Price Options</th><th>Actions</th></tr></thead>
      <tbody>
        ${cachedDogs.map(b => `
          <tr>
            <td>${thumb(b.image, "🐕")}</td>
            <td><strong>${b.breed_name}</strong></td>
            <td>${b.gender || "-"}</td>
            <td>${b.color || "-"}</td>
            <td>${b.vaccination_status || "-"}</td>
            <td>${b.availability ? "✅ Available" : "❌ Unavailable"}</td>
            <td>
              ${b.variants.map(v => `<div>${v.age_months} mo — ${formatPrice(v.price)} <span style="cursor:pointer;color:var(--danger)" onclick="deleteVariant(${v.id})">✕</span></div>`).join("") || "None"}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openVariantModal(${b.id})">+ Add Age</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openBreedModal(${b.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteBreed(${b.id})">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openBreedModal(breedId = null) {
  const form = document.getElementById("breed-form");
  form.reset();
  document.getElementById("breed-error").textContent = "";
  document.getElementById("breed-id").value = breedId || "";
  document.getElementById("breed-modal-title").textContent = breedId ? "Edit Breed" : "Add Breed";

  if (breedId) {
    const b = cachedDogs.find(x => x.id === breedId);
    document.getElementById("b-name").value = b.breed_name;
    document.getElementById("b-gender").value = b.gender || "";
    document.getElementById("b-color").value = b.color || "";
    document.getElementById("b-vacc").value = b.vaccination_status || "";
    document.getElementById("b-health").value = b.health_information || "";
    document.getElementById("b-image").value = b.image || "";
    document.getElementById("b-avail").value = String(b.availability);
  }
  document.getElementById("breed-modal").style.display = "flex";
}

document.getElementById("breed-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("breed-error");
  const breedId = document.getElementById("breed-id").value;
  const payload = {
    breed_name: document.getElementById("b-name").value.trim(),
    gender: document.getElementById("b-gender").value.trim(),
    color: document.getElementById("b-color").value.trim(),
    vaccination_status: document.getElementById("b-vacc").value.trim(),
    health_information: document.getElementById("b-health").value.trim(),
    image: document.getElementById("b-image").value.trim(),
    availability: document.getElementById("b-avail").value === "true",
  };
  try {
    if (breedId) {
      await api(`/admin/dogs/${breedId}`, { method: "PUT", body: payload });
    } else {
      await api("/admin/dogs", { method: "POST", body: payload });
    }
    closeModal("breed-modal");
    showToast("Breed saved!", "success");
    renderTab();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function deleteBreed(id) {
  if (!confirm("Delete this breed and all its age options?")) return;
  try {
    await api(`/admin/dogs/${id}`, { method: "DELETE" });
    showToast("Breed deleted");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

function openVariantModal(breedId) {
  document.getElementById("variant-form").reset();
  document.getElementById("variant-error").textContent = "";
  document.getElementById("variant-breed-id").value = breedId;
  document.getElementById("variant-modal").style.display = "flex";
}

document.getElementById("variant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("variant-error");
  const breedId = document.getElementById("variant-breed-id").value;
  try {
    await api(`/admin/dogs/${breedId}/variants`, {
      method: "POST",
      body: { age_months: Number(document.getElementById("v-age").value), price: Number(document.getElementById("v-price").value) },
    });
    closeModal("variant-modal");
    showToast("Age option added!", "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteVariant(id) {
  if (!confirm("Remove this age/price option?")) return;
  try {
    await api(`/admin/dog-variants/${id}`, { method: "DELETE" });
    showToast("Removed");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== FOOD ====================
async function renderFoodTab() {
  cachedFood = await api("/food");
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary" onclick="openFoodModal()">+ Add Product</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Image</th><th>Product</th><th>Brand</th><th>Category</th><th>Weight/Price Options</th><th>Actions</th></tr></thead>
      <tbody>
        ${cachedFood.map(p => `
          <tr>
            <td>${thumb(p.image, "🍖")}</td>
            <td><strong>${p.product_name}</strong></td>
            <td>${p.brand}</td>
            <td>${p.category || "-"}</td>
            <td>
              ${p.variants.map(v => `<div>${v.weight_kg} KG — ${formatPrice(v.price)} (stock: ${v.stock}) <span style="cursor:pointer;color:var(--danger)" onclick="deleteFoodVariant(${v.id})">✕</span></div>`).join("") || "None"}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openFoodVariantModal(${p.id})">+ Add Weight</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openFoodModal(${p.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteFood(${p.id})">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openFoodModal(foodId = null) {
  const form = document.getElementById("food-form");
  form.reset();
  document.getElementById("food-error").textContent = "";
  document.getElementById("food-id").value = foodId || "";
  document.getElementById("food-modal-title").textContent = foodId ? "Edit Product" : "Add Food Product";

  if (foodId) {
    const p = cachedFood.find(x => x.id === foodId);
    document.getElementById("f-name").value = p.product_name;
    document.getElementById("f-category").value = p.category || "";
    document.getElementById("f-desc").value = p.description || "";
    document.getElementById("f-image").value = p.image || "";
  }
  document.getElementById("food-modal").style.display = "flex";
}

document.getElementById("food-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("food-error");
  const foodId = document.getElementById("food-id").value;
  const payload = {
    product_name: document.getElementById("f-name").value.trim(),
    category: document.getElementById("f-category").value.trim(),
    description: document.getElementById("f-desc").value.trim(),
    image: document.getElementById("f-image").value.trim(),
    brand: "MBN",
  };
  try {
    if (foodId) {
      await api(`/admin/food/${foodId}`, { method: "PUT", body: payload });
    } else {
      await api("/admin/food", { method: "POST", body: payload });
    }
    closeModal("food-modal");
    showToast("Product saved!", "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteFood(id) {
  if (!confirm("Delete this food product and all its variants?")) return;
  try {
    await api(`/admin/food/${id}`, { method: "DELETE" });
    showToast("Product deleted");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

function openFoodVariantModal(foodId) {
  document.getElementById("food-variant-form").reset();
  document.getElementById("food-variant-error").textContent = "";
  document.getElementById("fv-food-id").value = foodId;
  document.getElementById("fv-stock").value = 100;
  document.getElementById("food-variant-modal").style.display = "flex";
}

document.getElementById("food-variant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("food-variant-error");
  const foodId = document.getElementById("fv-food-id").value;
  try {
    await api(`/admin/food/${foodId}/variants`, {
      method: "POST",
      body: {
        weight_kg: Number(document.getElementById("fv-weight").value),
        price: Number(document.getElementById("fv-price").value),
        stock: Number(document.getElementById("fv-stock").value),
      },
    });
    closeModal("food-variant-modal");
    showToast("Weight option added!", "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteFoodVariant(id) {
  if (!confirm("Remove this weight/price option?")) return;
  try {
    await api(`/admin/food-variants/${id}`, { method: "DELETE" });
    showToast("Removed");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== SERVICES ====================
async function renderServicesTab() {
  cachedServices = await api("/services");
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary" onclick="openServiceModal()">+ Add Service Category</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Service</th><th>Packages</th><th>Actions</th></tr></thead>
      <tbody>
        ${cachedServices.map(s => `
          <tr>
            <td><strong>${s.service_name}</strong><br><span class="card-meta">${s.description || ""}</span></td>
            <td>
              ${s.packages.map(p => `<div>${p.package_name} (${p.duration}) — ${formatPrice(p.price)} <span style="cursor:pointer;color:var(--danger)" onclick="deletePackage(${p.id})">✕</span></div>`).join("") || "None"}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openPackageModal(${s.id})">+ Add Package</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openServiceModal(${s.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteService(${s.id})">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openServiceModal(serviceId = null) {
  const form = document.getElementById("service-form");
  form.reset();
  document.getElementById("service-error").textContent = "";
  document.getElementById("service-id").value = serviceId || "";
  document.getElementById("service-modal-title").textContent = serviceId ? "Edit Service" : "Add Service Category";

  if (serviceId) {
    const s = cachedServices.find(x => x.id === serviceId);
    document.getElementById("s-name").value = s.service_name;
    document.getElementById("s-desc").value = s.description || "";
    document.getElementById("s-image").value = s.image || "";
  }
  document.getElementById("service-modal").style.display = "flex";
}

document.getElementById("service-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("service-error");
  const serviceId = document.getElementById("service-id").value;
  const payload = {
    service_name: document.getElementById("s-name").value.trim(),
    description: document.getElementById("s-desc").value.trim(),
    image: document.getElementById("s-image").value.trim(),
  };
  try {
    if (serviceId) {
      await api(`/admin/services/${serviceId}`, { method: "PUT", body: payload });
    } else {
      await api("/admin/services", { method: "POST", body: payload });
    }
    closeModal("service-modal");
    showToast("Service saved!", "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteService(id) {
  if (!confirm("Delete this service category and all its packages?")) return;
  try {
    await api(`/admin/services/${id}`, { method: "DELETE" });
    showToast("Service deleted");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

function openPackageModal(serviceId) {
  document.getElementById("package-form").reset();
  document.getElementById("package-error").textContent = "";
  document.getElementById("pkg-service-id").value = serviceId;
  document.getElementById("package-modal").style.display = "flex";
}

document.getElementById("package-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("package-error");
  const serviceId = document.getElementById("pkg-service-id").value;
  try {
    await api(`/admin/services/${serviceId}/packages`, {
      method: "POST",
      body: {
        package_name: document.getElementById("pkg-name").value.trim(),
        duration: document.getElementById("pkg-duration").value.trim(),
        price: Number(document.getElementById("pkg-price").value),
      },
    });
    closeModal("package-modal");
    showToast("Package added!", "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deletePackage(id) {
  if (!confirm("Remove this package?")) return;
  try {
    await api(`/admin/service-packages/${id}`, { method: "DELETE" });
    showToast("Removed");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== CUSTOMERS ====================
async function renderCustomersTab() {
  const customers = await api("/admin/customers");
  const el = document.getElementById("tab-content");
  if (!customers.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><h3>No customers yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Address</th></tr></thead>
      <tbody>
        ${customers.map(c => `
          <tr><td>${c.user_id}</td><td>${c.full_name}</td><td>${c.email}</td><td>${c.phone}</td><td>${c.address || "-"}</td></tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ==================== ORDERS ====================
const ORDER_STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];

async function renderOrdersTab() {
  const orders = await api("/admin/orders");
  const el = document.getElementById("tab-content");
  if (!orders.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><h3>No orders yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <p class="helper-text" style="margin-bottom:10px;">Setting an order to "Delivered" starts its 7-day return window automatically.</p>
    <table class="admin-table">
      <thead><tr><th>Order ID</th><th>Items</th><th>Total</th><th>Delivery Address</th><th>Payment</th><th>Delivered At</th><th>Status</th></tr></thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td>${o.order_id}</td>
            <td>${o.items.map(i => (i.details && (i.details.breed_name || i.details.product_name)) || "Item").join(", ")}</td>
            <td>${formatPrice(o.total_amount)}</td>
            <td>${o.delivery_address}</td>
            <td>${o.payment_method || "COD"}</td>
            <td>${o.delivered_at ? new Date(o.delivered_at).toLocaleString() : "—"}</td>
            <td>
              <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
                ${ORDER_STATUSES.map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/admin/orders/${orderId}/status`, { method: "PUT", body: { status } });
    showToast("Order status updated!", "success");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== RETURNS ====================
const RETURN_STATUSES = ["Pending", "Approved", "Rejected", "Completed"];

async function renderReturnsTab() {
  const returns = await api("/admin/returns");
  const el = document.getElementById("tab-content");
  if (!returns.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">↩</div><h3>No return requests yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Order</th><th>Customer</th><th>Requested On</th><th>Reason</th><th>Status</th></tr></thead>
      <tbody>
        ${returns.map(r => `
          <tr>
            <td>${r.order_number}</td>
            <td>${r.customer_name} (${r.customer_user_id})</td>
            <td>${new Date(r.request_date).toLocaleString()}</td>
            <td>${r.reason || "-"}</td>
            <td>
              <select class="status-select" onchange="updateReturnStatus(${r.id}, this.value)">
                ${RETURN_STATUSES.map(s => `<option value="${s}" ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function updateReturnStatus(returnId, status) {
  try {
    await api(`/admin/returns/${returnId}/status`, { method: "PUT", body: { status } });
    showToast("Return status updated!", "success");
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== BOOKINGS ====================
const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];

async function renderBookingsTab() {
  const bookings = await api("/admin/bookings");
  const el = document.getElementById("tab-content");
  if (!bookings.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">🗓️</div><h3>No bookings yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Booking ID</th><th>Service</th><th>Package</th><th>Date</th><th>Time</th><th>Price</th><th>Status</th></tr></thead>
      <tbody>
        ${bookings.map(b => `
          <tr>
            <td>${b.booking_id}</td>
            <td>${b.service}</td>
            <td>${b.package}</td>
            <td>${b.booking_date}</td>
            <td>${b.booking_time}</td>
            <td>${formatPrice(b.price)}</td>
            <td>
              <select class="status-select" onchange="updateBookingStatus(${b.id}, this.value)">
                ${BOOKING_STATUSES.map(s => `<option value="${s}" ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}
              </select>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function updateBookingStatus(bookingId, status) {
  try {
    await api(`/admin/bookings/${bookingId}/status`, { method: "PUT", body: { status } });
    showToast("Booking status updated!", "success");
  } catch (err) { showToast(err.message, "error"); }
}

renderTab();
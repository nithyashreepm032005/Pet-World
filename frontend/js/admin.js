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
      <button class="btn btn-primary" onclick="openBreedModal()" data-i18n="admin.add_breed">+ Add Breed</button>
    </div>
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_image">Image</th><th data-i18n="admin.th_breed">Breed</th><th data-i18n="admin.th_gender">Gender</th><th data-i18n="admin.th_color">Color</th><th data-i18n="admin.th_vaccination">Vaccination</th><th data-i18n="admin.th_availability">Availability</th><th data-i18n="admin.th_age_price">Age/Price Options</th><th data-i18n="admin.th_actions">Actions</th></tr></thead>
      <tbody>
        ${cachedDogs.map(b => `
          <tr>
            <td>${thumb(b.image, "🐕")}</td>
            <td><strong>${b.breed_name}</strong></td>
            <td>${b.gender || "-"}</td>
            <td>${b.color || "-"}</td>
            <td>${b.vaccination_status || "-"}</td>
            <td>${b.availability ? '✅ <span data-i18n="common.available">Available</span>' : '❌ <span data-i18n="common.unavailable">Unavailable</span>'}</td>
            <td>
              ${b.variants.map(v => `<div>${v.age_months} ${t("admin.age_mo", "mo")} — ${formatPrice(v.price)} <span style="cursor:pointer;color:var(--danger)" onclick="deleteVariant(${v.id})">✕</span></div>`).join("") || t("admin.none", "None")}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openVariantModal(${b.id})" data-i18n="admin.add_age">+ Add Age</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openBreedModal(${b.id})" data-i18n="admin.edit">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteBreed(${b.id})" data-i18n="admin.delete">Delete</button>
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
  setI18nText(
    document.getElementById("breed-modal-title"),
    breedId ? "admin.edit_breed_title" : "admin.add_breed_title",
    breedId ? "Edit Breed" : "Add Breed"
  );

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
    showToast(t("admin.breed_saved", "Breed saved!"), "success");
    renderTab();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function deleteBreed(id) {
  if (!confirm(t("admin.confirm_delete_breed", "Delete this breed and all its age options?"))) return;
  try {
    await api(`/admin/dogs/${id}`, { method: "DELETE" });
    showToast(t("admin.breed_deleted", "Breed deleted"));
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
    showToast(t("admin.variant_added", "Age option added!"), "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteVariant(id) {
  if (!confirm(t("admin.confirm_remove_variant", "Remove this age/price option?"))) return;
  try {
    await api(`/admin/dog-variants/${id}`, { method: "DELETE" });
    showToast(t("my_dogs.removed", "Removed"));
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== FOOD ====================
async function renderFoodTab() {
  cachedFood = await api("/food");
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary" onclick="openFoodModal()" data-i18n="admin.add_product">+ Add Product</button>
    </div>
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_image">Image</th><th data-i18n="admin.th_product">Product</th><th data-i18n="admin.th_brand">Brand</th><th data-i18n="admin.th_category">Category</th><th data-i18n="admin.th_weight_price">Weight/Price Options</th><th data-i18n="admin.th_actions">Actions</th></tr></thead>
      <tbody>
        ${cachedFood.map(p => `
          <tr>
            <td>${thumb(p.image, "🍖")}</td>
            <td><strong>${p.product_name}</strong></td>
            <td>${p.brand}</td>
            <td>${p.category || "-"}</td>
            <td>
              ${p.variants.map(v => `<div>${v.weight_kg} KG — ${formatPrice(v.price)} (${t("admin.stock", "stock")}: ${v.stock}) <span style="cursor:pointer;color:var(--danger)" onclick="deleteFoodVariant(${v.id})">✕</span></div>`).join("") || t("admin.none", "None")}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openFoodVariantModal(${p.id})" data-i18n="admin.add_weight">+ Add Weight</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openFoodModal(${p.id})" data-i18n="admin.edit">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteFood(${p.id})" data-i18n="admin.delete">Delete</button>
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
  setI18nText(
    document.getElementById("food-modal-title"),
    foodId ? "admin.edit_food_title" : "admin.add_food_title",
    foodId ? "Edit Product" : "Add Food Product"
  );

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
    showToast(t("admin.product_saved", "Product saved!"), "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteFood(id) {
  if (!confirm(t("admin.confirm_delete_food", "Delete this food product and all its variants?"))) return;
  try {
    await api(`/admin/food/${id}`, { method: "DELETE" });
    showToast(t("admin.product_deleted", "Product deleted"));
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
    showToast(t("admin.weight_added", "Weight option added!"), "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteFoodVariant(id) {
  if (!confirm(t("admin.confirm_remove_food_variant", "Remove this weight/price option?"))) return;
  try {
    await api(`/admin/food-variants/${id}`, { method: "DELETE" });
    showToast(t("my_dogs.removed", "Removed"));
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== SERVICES ====================
async function renderServicesTab() {
  cachedServices = await api("/services");
  const el = document.getElementById("tab-content");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary" onclick="openServiceModal()" data-i18n="admin.add_service_cat">+ Add Service Category</button>
    </div>
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_image">Image</th><th data-i18n="admin.th_service">Service</th><th data-i18n="admin.th_packages">Packages</th><th data-i18n="admin.th_actions">Actions</th></tr></thead>
      <tbody>
        ${cachedServices.map(s => `
          <tr>
            <td>${thumb(resolveImageUrl(s.image), "🛁")}</td>
            <td><strong>${s.service_name}</strong><br><span class="card-meta">${s.description || ""}</span></td>
            <td>
              ${s.packages.map(p => `<div>${p.package_name} (${p.duration}) — ${formatPrice(p.price)} <span style="cursor:pointer;color:var(--danger)" onclick="deletePackage(${p.id})">✕</span></div>`).join("") || t("admin.none", "None")}
              <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openPackageModal(${s.id})" data-i18n="admin.add_package">+ Add Package</button>
            </td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="openServiceModal(${s.id})" data-i18n="admin.edit">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteService(${s.id})" data-i18n="admin.delete">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderServiceImagePreview(imagePath, emoji = "🛁") {
  const box = document.getElementById("s-image-preview");
  if (!box) return;
  const src = resolveImageUrl(imagePath);
  box.innerHTML =
    `<span style="position:absolute; font-size:44px;">${emoji}</span>` +
    (src ? `<img src="${src}" alt="" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;" onerror="pwImgError(this)">` : "");
}

function openServiceModal(serviceId = null) {
  const form = document.getElementById("service-form");
  form.reset();
  document.getElementById("service-error").textContent = "";
  document.getElementById("service-id").value = serviceId || "";
  setI18nText(
    document.getElementById("service-modal-title"),
    serviceId ? "admin.edit_service_title" : "admin.add_service_title",
    serviceId ? "Edit Service" : "Add Service Category"
  );

  let imagePath = "";
  if (serviceId) {
    const s = cachedServices.find(x => x.id === serviceId);
    document.getElementById("s-name").value = s.service_name;
    document.getElementById("s-desc").value = s.description || "";
    document.getElementById("s-image").value = s.image || "";
    imagePath = s.image || "";
  }
  renderServiceImagePreview(imagePath);
  document.getElementById("service-modal").style.display = "flex";
}

// Live preview of a newly chosen image file before it is saved.
document.getElementById("s-image-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const box = document.getElementById("s-image-preview");
  box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;">`;
});

document.getElementById("service-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("service-error");
  const serviceId = document.getElementById("service-id").value;
  const fileInput = document.getElementById("s-image-file");
  const file = fileInput.files[0];
  const payload = {
    service_name: document.getElementById("s-name").value.trim(),
    description: document.getElementById("s-desc").value.trim(),
    image: document.getElementById("s-image").value.trim(),
  };
  try {
    let saved;
    if (serviceId) {
      saved = await api(`/admin/services/${serviceId}`, { method: "PUT", body: payload });
    } else {
      saved = await api("/admin/services", { method: "POST", body: payload });
    }
    // A chosen file wins over the text path: save it and store its new path.
    if (file && saved && saved.id) {
      const fd = new FormData();
      fd.append("image", file);
      saved = await apiUpload(`/admin/services/${saved.id}/image`, fd);
    }
    fileInput.value = "";
    closeModal("service-modal");
    showToast(t("admin.service_saved", "Service saved!"), "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deleteService(id) {
  if (!confirm(t("admin.confirm_delete_service", "Delete this service category and all its packages?"))) return;
  try {
    await api(`/admin/services/${id}`, { method: "DELETE" });
    showToast(t("admin.service_deleted", "Service deleted"));
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
    showToast(t("admin.package_added", "Package added!"), "success");
    renderTab();
  } catch (err) { errorEl.textContent = err.message; }
});

async function deletePackage(id) {
  if (!confirm(t("admin.confirm_remove_package", "Remove this package?"))) return;
  try {
    await api(`/admin/service-packages/${id}`, { method: "DELETE" });
    showToast(t("my_dogs.removed", "Removed"));
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== CUSTOMERS ====================
async function renderCustomersTab() {
  const customers = await api("/admin/customers");
  const el = document.getElementById("tab-content");
  if (!customers.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><h3 data-i18n="admin.empty_customers">No customers yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_user_id">User ID</th><th data-i18n="admin.th_name">Name</th><th data-i18n="admin.th_email">Email</th><th data-i18n="admin.th_phone">Phone</th><th data-i18n="admin.th_address">Address</th></tr></thead>
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
    el.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><h3 data-i18n="admin.empty_orders">No orders yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <p class="helper-text" style="margin-bottom:10px;" data-i18n="admin.orders_helper">Setting an order to "Delivered" starts its 7-day return window automatically.</p>
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_order_id">Order ID</th><th data-i18n="admin.th_items">Items</th><th data-i18n="admin.th_total">Total</th><th data-i18n="admin.th_delivery">Delivery Address</th><th data-i18n="admin.th_payment">Payment</th><th data-i18n="admin.th_delivered_at">Delivered At</th><th data-i18n="admin.th_status">Status</th></tr></thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td>${o.order_id}</td>
            <td>${o.items.map(i => (i.details && (i.details.breed_name || i.details.product_name)) || t("common.item", "Item")).join(", ")}</td>
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
    showToast(t("admin.order_status_updated", "Order status updated!"), "success");
    renderTab();
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== RETURNS ====================
const RETURN_STATUSES = ["Pending", "Approved", "Rejected", "Completed"];

async function renderReturnsTab() {
  const returns = await api("/admin/returns");
  const el = document.getElementById("tab-content");
  if (!returns.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">↩</div><h3 data-i18n="admin.empty_returns">No return requests yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_order">Order</th><th data-i18n="admin.th_customer">Customer</th><th data-i18n="admin.th_requested_on">Requested On</th><th data-i18n="admin.th_reason">Reason</th><th data-i18n="admin.th_status">Status</th></tr></thead>
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
    showToast(t("admin.return_status_updated", "Return status updated!"), "success");
  } catch (err) { showToast(err.message, "error"); }
}

// ==================== BOOKINGS ====================
const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];

async function renderBookingsTab() {
  const bookings = await api("/admin/bookings");
  const el = document.getElementById("tab-content");
  if (!bookings.length) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">🗓️</div><h3 data-i18n="admin.empty_bookings">No bookings yet</h3></div>`;
    return;
  }
  el.innerHTML = `
    <table class="admin-table">
      <thead><tr><th data-i18n="admin.th_booking_id">Booking ID</th><th data-i18n="admin.th_service">Service</th><th data-i18n="admin.th_package">Package</th><th data-i18n="admin.th_date">Date</th><th data-i18n="admin.th_time">Time</th><th data-i18n="admin.th_price">Price</th><th data-i18n="admin.th_status">Status</th></tr></thead>
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
    showToast(t("admin.booking_status_updated", "Booking status updated!"), "success");
  } catch (err) { showToast(err.message, "error"); }
}

renderTab();
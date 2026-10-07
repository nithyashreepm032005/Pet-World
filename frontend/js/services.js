requireCustomer();
renderTopbar("services");
refreshCartBadge();

let allServices = [];
let favouriteIds = new Set();

async function loadFavourites() {
  try {
    const favs = await api("/favourites");
    favouriteIds = new Set(favs.filter(f => f.item_type === "service").map(f => f.item_id));
  } catch (e) {}
}

async function loadServices() {
  const container = document.getElementById("services-container");
  try {
    await loadFavourites();
    allServices = await api("/services");
    if (!allServices.length) {
      container.innerHTML = `<div class="empty-state"><div class="emoji">🛁</div><h3 data-i18n="services.empty_title">No services available right now</h3></div>`;
      return;
    }
    container.innerHTML = `<div class="grid">${allServices.map(renderServiceCard).join("")}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderServiceCard(service) {
  const isFav = favouriteIds.has(service.id);
  const isTraining = service.service_name.includes("Training");
  const emoji = isTraining ? "🎾" : "🛁";
  const color = isTraining ? "#7c5cff" : "#ff6b9d";
  const unavailable = service.availability === false;

  // The image comes straight from the database/API (services.image), so an
  // admin edit shows up here with no frontend changes. The emoji sits behind
  // the image; if the file is missing pwImgError() first tries the default
  // image and then hides the <img>, so a broken icon is never displayed.
  const src = resolveImageUrl(service.image);
  const imgHtml = `
    ${emoji}
    <img src="${src || PW_DEFAULT_IMAGE}" alt="${service.service_name}"
         style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;"
         onerror="pwImgError(this)">`;

  const packages = service.packages || [];
  const priceHtml = packages.length
    ? `<div class="card-price"><span data-i18n="services.from">From</span> ${formatPrice(Math.min(...packages.map(p => p.price)))}</div>`
    : "";

  const actionHtml = unavailable
    ? `<span class="btn btn-outline btn-block" style="opacity:.6; cursor:not-allowed;" data-i18n="services.unavailable">Currently Unavailable</span>`
    : `<a class="btn btn-primary btn-block" href="book-service.html?service_id=${service.id}" data-i18n="services.book_now">Book Now</a>`;

  return `
    <div class="card">
      <div class="card-img" style="background:${color}; position:relative; display:flex; align-items:center; justify-content:center; font-size:56px;">
        ${imgHtml}
        <button class="card-fav ${isFav ? 'active' : ''}" onclick="toggleFavourite(${service.id}, this)">${isFav ? '❤' : '🤍'}</button>
      </div>
      <div class="card-body">
        <h3>${service.service_name}</h3>
        <p class="card-meta">${service.description || ""}</p>
        <p class="card-meta" data-i18n="services.store_line">🏪 Store Service — bring your pet to our store</p>
        <p class="card-meta"><span data-i18n="services.home_line">🏠 Home Service — we visit you</span> <strong data-i18n="services.bengaluru_only">(Bengaluru only)</strong></p>
        ${priceHtml}
      </div>
      <div class="card-actions">
        ${actionHtml}
      </div>
    </div>
  `;
}

async function toggleFavourite(serviceId, btnEl) {
  try {
    if (favouriteIds.has(serviceId)) {
      const favs = await api("/favourites");
      const fav = favs.find(f => f.item_type === "service" && f.item_id === serviceId);
      if (fav) await api(`/favourites/${fav.id}`, { method: "DELETE" });
      favouriteIds.delete(serviceId);
      btnEl.textContent = "🤍";
      btnEl.classList.remove("active");
      showToast(t("common.fav_removed", "Removed from favourites"));
    } else {
      await api("/favourites", { method: "POST", body: { item_type: "service", item_id: serviceId } });
      favouriteIds.add(serviceId);
      btnEl.textContent = "❤";
      btnEl.classList.add("active");
      showToast(t("common.fav_added", "Added to favourites"), "success");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadServices();
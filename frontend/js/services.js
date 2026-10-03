requireAuth();
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
      container.innerHTML = `<div class="empty-state"><div class="emoji">🛁</div><h3>No services available right now</h3></div>`;
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
  const color = isTraining ? "#7c5cff" : "#ff6b9d";
  const img1 = isTraining ? "images/services/training1.jpg" : "images/services/grooming1.jpg";
  const img2 = isTraining ? "images/services/training2.jpg" : "images/services/grooming2.jpg";

  return `
    <div class="card">
      <div class="card-img" style="background:${color}; position:relative; display:flex; padding:0;">
        <img src="${img1}" alt="${service.service_name}" style="width:50%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
        <img src="${img2}" alt="${service.service_name}" style="width:50%; height:100%; object-fit:cover;" onerror="this.style.display='none';">
        <button class="card-fav ${isFav ? 'active' : ''}" onclick="toggleFavourite(${service.id}, this)">${isFav ? '❤' : '🤍'}</button>
      </div>
      <div class="card-body">
        <h3>${service.service_name}</h3>
        <p class="card-meta">${service.description || ""}</p>
        <p class="card-meta">🏪 Store Service — bring your pet to our store</p>
        <p class="card-meta">🏠 Home Service — we visit you <strong>(Bengaluru only)</strong></p>
      </div>
      <div class="card-actions">
        <a class="btn btn-primary btn-block" href="book-service.html?service_id=${service.id}">Book Now</a>
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
      showToast("Removed from favourites");
    } else {
      await api("/favourites", { method: "POST", body: { item_type: "service", item_id: serviceId } });
      favouriteIds.add(serviceId);
      btnEl.textContent = "❤";
      btnEl.classList.add("active");
      showToast("Added to favourites", "success");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadServices();

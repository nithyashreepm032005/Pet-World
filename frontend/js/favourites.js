requireCustomer();
renderTopbar("favourites");
refreshCartBadge();

const TYPE_EMOJI = { dog: "🐕", food: "🍖", service: "🛁" };
const TYPE_COLOR = { dog: "#ff9a56", food: "#3fb8af", service: "#7c5cff" };

async function loadFavourites() {
  const grid = document.getElementById("fav-grid");
  try {
    const favs = await api("/favourites");
    if (!favs.length) {
      grid.innerHTML = `<div class="empty-state"><div class="emoji">💔</div><h3>No favourites yet</h3><p>Tap the heart icon on any dog, food, or service to save it here.</p></div>`;
      return;
    }
    grid.innerHTML = favs.map(renderFavCard).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderFavCard(fav) {
  const item = fav.item;
  if (!item) return "";
  let name, meta, price, imgUrl;

  if (fav.item_type === "dog") {
    name = item.breed_name;
    meta = `${item.gender} · ${item.color}`;
    price = item.variants && item.variants.length ? formatPrice(item.variants[0].price) : "";
    imgUrl = item.image;
  } else if (fav.item_type === "food") {
    name = item.product_name;
    meta = item.brand;
    price = item.variants && item.variants.length ? formatPrice(item.variants[0].price) : "";
    imgUrl = item.image;
  } else {
    name = item.service_name;
    meta = `${item.packages ? item.packages.length : 0} packages`;
    price = item.packages && item.packages.length ? "From " + formatPrice(Math.min(...item.packages.map(p => p.price))) : "";
    imgUrl = name.includes("Training") ? "images/services/training1.jpg" : "images/services/grooming1.jpg";
  }

  const linkMap = { dog: "dogs.html", food: "food.html", service: "services.html" };

  return `
    <div class="card">
      <div class="card-img" style="background:${TYPE_COLOR[fav.item_type]}; position:relative;">
        <img src="${imgUrl || ''}" alt="${name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerHTML+='${TYPE_EMOJI[fav.item_type]}';">
      </div>
      <div class="card-body">
        <span class="card-tag">${fav.item_type.toUpperCase()}</span>
        <h3>${name}</h3>
        <p class="card-meta">${meta}</p>
        <div class="card-price">${price}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-outline" onclick="removeFavourite(${fav.id})">Remove</button>
        <a class="btn btn-primary" href="${linkMap[fav.item_type]}">View</a>
      </div>
    </div>
  `;
}

async function removeFavourite(favId) {
  try {
    await api(`/favourites/${favId}`, { method: "DELETE" });
    showToast("Removed from favourites");
    loadFavourites();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadFavourites();

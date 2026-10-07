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
      grid.innerHTML = `<div class="empty-state"><div class="emoji">💔</div><h3 data-i18n="favourites.empty_title">No favourites yet</h3><p data-i18n="favourites.empty_text">Tap the heart icon on any dog, food, or service to save it here.</p></div>`;
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
    meta = `${item.packages ? item.packages.length : 0} <span data-i18n="favourites.packages_count">packages</span>`;
    price = item.packages && item.packages.length ? `<span data-i18n="favourites.from">From</span> ${formatPrice(Math.min(...item.packages.map(p => p.price)))}` : "";
    // Use the image stored in the database for this service - never a
    // hardcoded filename - so admin image changes show up here too.
    imgUrl = item.image;
  }

  const linkMap = { dog: "dogs.html", food: "food.html", service: "services.html" };
  const emoji = TYPE_EMOJI[fav.item_type];
  const src = resolveImageUrl(imgUrl);
  // Services fall back to the default service image, then to the emoji tile;
  // dogs/food fall back straight to their emoji tile.
  const onError = fav.item_type === "service" ? "pwImgError(this)" : "this.style.display='none';";
  const imgHtml = src
    ? `<img src="${src}" alt="${name}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover;" onerror="${onError}">`
    : "";

  return `
    <div class="card">
      <div class="card-img" style="background:${TYPE_COLOR[fav.item_type]}; position:relative; display:flex; align-items:center; justify-content:center; font-size:56px;">
        ${emoji}
        ${imgHtml}
      </div>
      <div class="card-body">
        <span class="card-tag">${fav.item_type.toUpperCase()}</span>
        <h3>${name}</h3>
        <p class="card-meta">${meta}</p>
        <div class="card-price">${price}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-outline" onclick="removeFavourite(${fav.id})" data-i18n="common.remove">Remove</button>
        <a class="btn btn-primary" href="${linkMap[fav.item_type]}" data-i18n="common.view">View</a>
      </div>
    </div>
  `;
}

async function removeFavourite(favId) {
  try {
    await api(`/favourites/${favId}`, { method: "DELETE" });
    showToast(t("common.fav_removed", "Removed from favourites"));
    loadFavourites();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadFavourites();

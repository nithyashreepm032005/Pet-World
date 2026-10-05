requireAuth();
renderTopbar("food");
refreshCartBadge();

let allFood = [];
let favouriteIds = new Set();
let selectedWeights = {};
let pendingBuy = null;
let myAccount = null;

const CARD_COLORS = ["#3fb8af", "#ff9a56", "#7c5cff", "#ff6b9d", "#ffc93c", "#56d6c9"];
function colorFor(id) { return CARD_COLORS[id % CARD_COLORS.length]; }

async function loadAccount() {
  try { myAccount = await api("/account"); } catch (e) { /* ignore */ }
}

async function loadFavourites() {
  try {
    const favs = await api("/favourites");
    favouriteIds = new Set(favs.filter(f => f.item_type === "food").map(f => f.item_id));
  } catch (e) {}
}

async function loadFood() {
  const grid = document.getElementById("food-grid");
  try {
    await Promise.all([loadFavourites(), loadAccount()]);
    allFood = await api("/food");
    if (!allFood.length) {
      grid.innerHTML = `<div class="empty-state"><div class="emoji">🍖</div><h3>No products available right now</h3></div>`;
      return;
    }
    grid.innerHTML = allFood.map(renderFoodCard).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderFoodCard(product) {
  const variants = [...product.variants].sort((a, b) => a.weight_kg - b.weight_kg);
  const defaultVariant = variants[0];
  selectedWeights[product.id] = defaultVariant ? defaultVariant.id : null;
  const isFav = favouriteIds.has(product.id);

  const weightChips = variants.map(v => `
    <span class="chip ${v.id === defaultVariant.id ? 'active' : ''}" data-variant="${v.id}" onclick="selectWeight(${product.id}, ${v.id})">
      ${v.weight_kg} KG
    </span>
  `).join("");

  return `
    <div class="card" id="food-card-${product.id}">
      <div class="card-img" style="background:${colorFor(product.id)}; position:relative;">
        <img src="${product.image}" alt="${product.product_name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerHTML+='🍖';">
        <button class="card-fav ${isFav ? 'active' : ''}" onclick="toggleFavourite(${product.id}, this)">${isFav ? '❤' : '🤍'}</button>
      </div>
      <div class="card-body">
        <span class="card-tag">${product.brand}</span>
        <h3>${product.product_name}</h3>
        <p class="card-meta">${product.description || ""}</p>
      </div>
      <div class="select-group">${weightChips}</div>
      <div class="card-body" style="padding-top:10px;">
        <div class="card-price" id="price-${product.id}">${formatPrice(defaultVariant ? defaultVariant.price : 0)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-outline" onclick="addToCart(${product.id})">🛒 Add to Cart</button>
        <button class="btn btn-primary" onclick="buyNow(${product.id})">⚡ Buy Now</button>
      </div>
    </div>
  `;
}

function selectWeight(productId, variantId) {
  selectedWeights[productId] = variantId;
  const product = allFood.find(p => p.id === productId);
  const variant = product.variants.find(v => v.id === variantId);
  document.getElementById(`price-${productId}`).textContent = formatPrice(variant.price);
  document.querySelectorAll(`#food-card-${productId} .chip`).forEach(chip => {
    chip.classList.toggle("active", parseInt(chip.dataset.variant) === variantId);
  });
}

async function toggleFavourite(productId, btnEl) {
  try {
    if (favouriteIds.has(productId)) {
      const favs = await api("/favourites");
      const fav = favs.find(f => f.item_type === "food" && f.item_id === productId);
      if (fav) await api(`/favourites/${fav.id}`, { method: "DELETE" });
      favouriteIds.delete(productId);
      btnEl.textContent = "🤍";
      btnEl.classList.remove("active");
      showToast("Removed from favourites");
    } else {
      await api("/favourites", { method: "POST", body: { item_type: "food", item_id: productId } });
      favouriteIds.add(productId);
      btnEl.textContent = "❤";
      btnEl.classList.add("active");
      showToast("Added to favourites", "success");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

function getSelectedVariant(productId) {
  const product = allFood.find(p => p.id === productId);
  const variantId = selectedWeights[productId];
  return { product, variant: product.variants.find(v => v.id === variantId) };
}

async function addToCart(productId) {
  const { product, variant } = getSelectedVariant(productId);
  try {
    await api("/cart/add", {
      method: "POST",
      body: {
        item_type: "food",
        item_id: product.id,
        variant_id: variant.id,
        quantity: 1,
        price: variant.price,
        details: { product_name: product.product_name, weight_kg: variant.weight_kg, image: product.image },
      },
    });
    showToast(`${product.product_name} added to cart!`, "success");
    refreshCartBadge();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// Pre-fills the delivery form with the customer's saved details, so they
// don't have to retype their name/phone/email on every single purchase.
function prefillBuyForm() {
  if (!myAccount) return;
  document.getElementById("bf-name").value = myAccount.full_name || "";
  document.getElementById("bf-phone").value = myAccount.phone || "";
  document.getElementById("bf-email").value = myAccount.email || "";
}

function buyNow(productId) {
  const { product, variant } = getSelectedVariant(productId);
  pendingBuy = {
    item_type: "food",
    item_id: product.id,
    price: variant.price,
    quantity: 1,
    selected_weight: variant.weight_kg,
    details: { product_name: product.product_name, weight_kg: variant.weight_kg, image: product.image },
  };
  prefillBuyForm();
  document.getElementById("buy-modal").style.display = "flex";
}

function closeBuyModal() {
  document.getElementById("buy-modal").style.display = "none";
  pendingBuy = null;
}

document.getElementById("buy-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("buy-error");
  errorEl.textContent = "";

  const pincode = document.getElementById("bf-pincode").value.trim();
  if (!/^5[6-9]\d{4}$/.test(pincode)) {
    errorEl.textContent = "Please enter a valid 6-digit Karnataka PIN code (starts with 56-59).";
    return;
  }
  if (!document.getElementById("bf-city").value) {
    errorEl.textContent = "Please select a city.";
    return;
  }

  const address = {
    full_name: document.getElementById("bf-name").value.trim(),
    phone: document.getElementById("bf-phone").value.trim(),
    email: document.getElementById("bf-email").value.trim(),
    house_number: document.getElementById("bf-house").value.trim(),
    street: document.getElementById("bf-street").value.trim(),
    area: document.getElementById("bf-area").value.trim(),
    city: document.getElementById("bf-city").value,
    state: document.getElementById("bf-state").value.trim(),
    pincode,
  };

  const payment = getPaymentPayload("bf-payment");
  if (!payment) return;

  try {
    await api("/checkout/buy-now", { method: "POST", body: { ...pendingBuy, address, ...payment } });
    showToast("Order placed successfully!", "success");
    closeBuyModal();
    setTimeout(() => (window.location.href = "orders.html"), 1200);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

loadFood();
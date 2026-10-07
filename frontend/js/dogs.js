requireCustomer();
renderTopbar("dogs");
refreshCartBadge();

let allBreeds = [];
let favouriteIds = new Set();
let selectedAges = {};
let activeBreedId = null;
let pendingBuy = null;
let myAccount = null; // cached profile, used to pre-fill the delivery form

const CARD_COLORS = ["#ff9a56", "#3fb8af", "#7c5cff", "#ff6b9d", "#ffc93c", "#56d6c9"];
function colorFor(id) {
  return CARD_COLORS[id % CARD_COLORS.length];
}

async function loadAccount() {
  try { myAccount = await api("/account"); } catch (e) { /* ignore */ }
}

async function loadFavourites() {
  try {
    const favs = await api("/favourites");
    favouriteIds = new Set(favs.filter(f => f.item_type === "dog").map(f => f.item_id));
  } catch (e) { /* ignore */ }
}

async function loadDogs() {
  const grid = document.getElementById("dogs-grid");
  try {
    await Promise.all([loadFavourites(), loadAccount()]);
    allBreeds = await api("/dogs");
    if (!allBreeds.length) {
      grid.innerHTML = `<div class="empty-state"><div class="emoji">🐕</div><h3>No breeds available right now</h3><p>Please check back soon!</p></div>`;
      return;
    }
    grid.innerHTML = allBreeds.map(renderBreedCard).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderBreedCard(breed) {
  const defaultVariant = [...breed.variants].sort((a, b) => a.age_months - b.age_months)[0];
  if (selectedAges[breed.id] === undefined) {
    selectedAges[breed.id] = defaultVariant ? defaultVariant.id : null;
  }
  const isFav = favouriteIds.has(breed.id);

  return `
    <div class="card" id="breed-card-${breed.id}">
      <div class="card-img" style="background:${colorFor(breed.id)}; position:relative;">
        <img src="${breed.image}" alt="${breed.breed_name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerHTML+='🐕';">
        <button class="card-fav ${isFav ? 'active' : ''}" onclick="toggleFavourite(${breed.id}, this)">${isFav ? '❤' : '🤍'}</button>
      </div>
      <div class="card-body">
        <span class="card-tag">${breed.availability ? 'Available' : 'Unavailable'}</span>
        <h3>${breed.breed_name}</h3>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-block" onclick="openDetailsModal(${breed.id})">View Details</button>
      </div>
    </div>
  `;
}

async function toggleFavourite(breedId, btnEl) {
  try {
    if (favouriteIds.has(breedId)) {
      const favs = await api("/favourites");
      const fav = favs.find(f => f.item_type === "dog" && f.item_id === breedId);
      if (fav) await api(`/favourites/${fav.id}`, { method: "DELETE" });
      favouriteIds.delete(breedId);
      btnEl.textContent = "🤍";
      btnEl.classList.remove("active");
      showToast("Removed from favourites");
    } else {
      await api("/favourites", { method: "POST", body: { item_type: "dog", item_id: breedId } });
      favouriteIds.add(breedId);
      btnEl.textContent = "❤";
      btnEl.classList.add("active");
      showToast("Added to favourites", "success");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openDetailsModal(breedId) {
  activeBreedId = breedId;
  const breed = allBreeds.find(b => b.id === breedId);
  const variants = [...breed.variants].sort((a, b) => a.age_months - b.age_months);
  if (!variants.find(v => v.id === selectedAges[breedId])) {
    selectedAges[breedId] = variants[0] ? variants[0].id : null;
  }

  document.getElementById("details-img").innerHTML =
    `<img src="${breed.image}" alt="${breed.breed_name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.style.background='${colorFor(breed.id)}'; this.remove();">`;
  document.getElementById("details-name").textContent = breed.breed_name;
  document.getElementById("details-meta").textContent = `${breed.gender} · ${breed.color} · ${breed.vaccination_status}`;
  document.getElementById("details-health").textContent = breed.health_information || "";

  document.getElementById("details-age-chips").innerHTML = variants.map(v => `
    <span class="chip ${v.id === selectedAges[breedId] ? 'active' : ''}" data-variant="${v.id}" onclick="selectDetailsAge(${v.id})">
      ${v.age_months < 12 ? v.age_months + ' mo' : (v.age_months / 12) + ' yr'}
    </span>
  `).join("");

  updateDetailsPrice();

  document.getElementById("details-cart-btn").onclick = () => addToCart(breedId);
  document.getElementById("details-buy-btn").onclick = () => buyNow(breedId);

  document.getElementById("details-modal").style.display = "flex";
}

function closeDetailsModal() {
  document.getElementById("details-modal").style.display = "none";
  activeBreedId = null;
}

function selectDetailsAge(variantId) {
  selectedAges[activeBreedId] = variantId;
  document.querySelectorAll("#details-age-chips .chip").forEach(chip => {
    chip.classList.toggle("active", parseInt(chip.dataset.variant) === variantId);
  });
  updateDetailsPrice();
}

function updateDetailsPrice() {
  const { variant } = getSelectedVariant(activeBreedId);
  document.getElementById("details-price").textContent = formatPrice(variant ? variant.price : 0);
}

function getSelectedVariant(breedId) {
  const breed = allBreeds.find(b => b.id === breedId);
  const variantId = selectedAges[breedId];
  return { breed, variant: breed.variants.find(v => v.id === variantId) };
}

async function addToCart(breedId) {
  const { breed, variant } = getSelectedVariant(breedId);
  try {
    await api("/cart/add", {
      method: "POST",
      body: {
        item_type: "dog",
        item_id: breed.id,
        variant_id: variant.id,
        quantity: 1,
        price: variant.price,
        details: { breed_name: breed.breed_name, age_months: variant.age_months, image: breed.image },
      },
    });
    showToast(`${breed.breed_name} added to cart!`, "success");
    refreshCartBadge();
    closeDetailsModal();
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

function buyNow(breedId) {
  const { breed, variant } = getSelectedVariant(breedId);
  pendingBuy = {
    item_type: "dog",
    item_id: breed.id,
    price: variant.price,
    quantity: 1,
    selected_age: variant.age_months,
    details: { breed_name: breed.breed_name, age_months: variant.age_months, image: breed.image },
  };
  closeDetailsModal();
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

loadDogs();
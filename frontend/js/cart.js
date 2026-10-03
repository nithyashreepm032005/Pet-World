requireAuth();
renderTopbar("cart");

const TYPE_EMOJI = { dog: "🐕", food: "🍖", service: "🛁" };
const TYPE_COLOR = { dog: "#ff9a56", food: "#3fb8af", service: "#7c5cff" };

async function loadCart() {
  const layout = document.getElementById("cart-layout");
  try {
    const data = await api("/cart");
    refreshCartBadge();

    if (!data.items.length) {
      layout.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="emoji">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Looks like you haven't added anything yet.</p>
          <a href="home.html" class="btn btn-primary" style="margin-top:16px;">Start Shopping</a>
        </div>`;
      return;
    }

    const hasGoods = data.items.some(i => i.item_type === "dog" || i.item_type === "food");
    const hasServices = data.items.some(i => i.item_type === "service");
    const deliveryRow = data.delivery_charge > 0
      ? `<div class="summary-row"><span>Delivery Charge</span><span>${formatPrice(data.delivery_charge)}</span></div>`
      : (hasGoods ? `<div class="summary-row"><span>Delivery Charge</span><span style="color:var(--success); font-weight:700;">FREE</span></div>` : "");
    const freeDeliveryNote = (hasGoods && data.delivery_charge > 0)
      ? `<p class="helper-text" style="margin-top:-4px; margin-bottom:10px;">Add ${formatPrice(data.free_delivery_threshold - data.goods_subtotal)} more of dogs/food for free delivery!</p>`
      : "";

    layout.innerHTML = `
      <div>${data.items.map(renderCartItem).join("")}</div>
      <div class="summary-card">
        <h3 style="margin-bottom:16px;">Order Summary</h3>
        <div class="summary-row"><span>Items</span><span>${data.items.reduce((s,i)=>s+i.quantity,0)}</span></div>
        ${deliveryRow}
        ${freeDeliveryNote}
        <div class="summary-total"><span>Total</span><span>${formatPrice(data.total)}</span></div>
        <button class="btn btn-primary btn-block" onclick="goCheckout()">Proceed to Checkout</button>
        ${hasGoods && hasServices ? '<p class="helper-text" style="margin-top:10px;">Your delivery items and service bookings will be checked out together.</p>' : ''}
      </div>
    `;
  } catch (err) {
    layout.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderCartItem(item) {
  const d = item.details || {};
  let title, meta;
  if (item.item_type === "dog") {
    title = d.breed_name || "Dog";
    meta = `Age: ${d.age_months} months`;
  } else if (item.item_type === "food") {
    title = d.product_name || "Food";
    meta = `Weight: ${d.weight_kg} KG`;
  } else {
    title = `${d.service_name || "Service"} — ${d.package_name || ""}`;
    meta = `${item.selected_date || ""} at ${item.selected_time || ""}`;
  }

  const imgBox = d.image
    ? `<img src="${d.image}" alt="${title}" style="width:90px; height:90px; border-radius:14px; object-fit:cover;" onerror="this.outerHTML='<div style=&quot;width:90px;height:90px;border-radius:14px;background:${TYPE_COLOR[item.item_type]};display:flex;align-items:center;justify-content:center;font-size:36px;&quot;>${TYPE_EMOJI[item.item_type]}</div>';">`
    : `<div style="width:90px; height:90px; border-radius:14px; background:${TYPE_COLOR[item.item_type]}; display:flex; align-items:center; justify-content:center; font-size:36px;">${TYPE_EMOJI[item.item_type]}</div>`;

  return `
    <div class="cart-item">
      ${imgBox}
      <div class="info">
        <h4>${title}</h4>
        <p>${meta}</p>
        <p style="font-weight:700; color:var(--primary-dark); margin-top:4px;">${formatPrice(item.price)} ${item.item_type !== 'service' ? 'each' : ''}</p>
        ${item.item_type !== "service" ? `
          <div class="qty-control">
            <button onclick="updateQty(${item.id}, ${item.quantity - 1})">−</button>
            <span>${item.quantity}</span>
            <button onclick="updateQty(${item.id}, ${item.quantity + 1})">+</button>
          </div>` : ""}
        <span class="remove-link" onclick="removeItem(${item.id})">Remove</span>
      </div>
      <div style="font-weight:800; font-size:16px;">${formatPrice(item.line_total)}</div>
    </div>
  `;
}

async function updateQty(itemId, qty) {
  if (qty < 1) return;
  try {
    await api(`/cart/${itemId}`, { method: "PUT", body: { quantity: qty } });
    loadCart();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function removeItem(itemId) {
  try {
    await api(`/cart/${itemId}`, { method: "DELETE" });
    showToast("Item removed from cart");
    loadCart();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function goCheckout() {
  window.location.href = "checkout.html";
}

loadCart();

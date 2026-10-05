requireAuth();
renderTopbar("checkout");

const TYPE_EMOJI = { dog: "🐕", food: "🍖", service: "🛁" };

async function prefillFromAccount() {
  try {
    const account = await api("/account");
    document.getElementById("c-name").value = account.full_name || "";
    document.getElementById("c-phone").value = account.phone || "";
    document.getElementById("c-email").value = account.email || "";
  } catch (e) { /* ignore - not fatal, just leave the fields blank */ }
}

async function loadSummary() {
  const el = document.getElementById("order-summary");
  try {
    const data = await api("/cart");
    if (!data.items.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">🛒</div><h3>Your cart is empty</h3><a href="home.html" class="btn btn-primary" style="margin-top:12px;">Start Shopping</a></div>`;
      document.getElementById("place-order-btn").disabled = true;
      return;
    }
    const goodsItems = data.items.filter(i => i.item_type === "dog" || i.item_type === "food");
    const hasGoods = goodsItems.length > 0;
    const freeDeliveryNote = (hasGoods && data.delivery_charge > 0)
      ? `<p class="helper-text" style="margin:-4px 0 10px;">Orders under ${formatPrice(data.free_delivery_threshold)} include a ${formatPrice(data.delivery_charge)} delivery charge. Add ${formatPrice(data.free_delivery_threshold - data.goods_subtotal)} more of dogs/food for free delivery!</p>`
      : (hasGoods ? `<p class="helper-text" style="margin:-4px 0 10px; color:var(--success);">Your order qualifies for free delivery!</p>` : "");

    el.innerHTML = `
      <h3 style="margin-bottom:16px;">Order Summary</h3>
      ${data.items.map(i => {
        const d = i.details || {};
        const name = d.breed_name || d.product_name || d.service_name || "Item";
        return `<div class="summary-row"><span>${TYPE_EMOJI[i.item_type]} ${name} x${i.quantity}</span><span>${formatPrice(i.line_total)}</span></div>`;
      }).join("")}
      ${hasGoods ? (data.delivery_charge > 0
        ? `<div class="summary-row"><span>Delivery Charge</span><span>${formatPrice(data.delivery_charge)}</span></div>`
        : `<div class="summary-row"><span>Delivery Charge</span><span style="color:var(--success); font-weight:700;">FREE</span></div>`
      ) : ""}
      ${freeDeliveryNote}
      <div class="summary-total"><span>Total</span><span>${formatPrice(data.total)}</span></div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

document.getElementById("place-order-btn").addEventListener("click", async () => {
  const errorEl = document.getElementById("checkout-error");
  errorEl.textContent = "";

  const pincode = document.getElementById("c-pincode").value.trim();
  if (!/^5[6-9]\d{4}$/.test(pincode)) {
    errorEl.textContent = "Please enter a valid 6-digit Karnataka PIN code (starts with 56-59).";
    return;
  }
  if (!document.getElementById("c-city").value) {
    errorEl.textContent = "Please select a city.";
    return;
  }

  const address = {
    full_name: document.getElementById("c-name").value.trim(),
    phone: document.getElementById("c-phone").value.trim(),
    email: document.getElementById("c-email").value.trim(),
    house_number: document.getElementById("c-house").value.trim(),
    street: document.getElementById("c-street").value.trim(),
    area: document.getElementById("c-area").value.trim(),
    city: document.getElementById("c-city").value,
    state: document.getElementById("c-state").value.trim(),
    pincode,
  };

  const payment = getPaymentPayload("c-payment");
  if (!payment) return;

  try {
    await api("/checkout/cart", { method: "POST", body: { address, ...payment } });
    showToast("Order placed successfully!", "success");
    localStorage.setItem("pw_cart_count", "0");
    setTimeout(() => (window.location.href = "orders.html"), 1200);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

prefillFromAccount();
loadSummary();
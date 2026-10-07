requireCustomer();
renderTopbar("orders");
refreshCartBadge();

let activeReturnOrderId = null;

async function loadOrders() {
  const el = document.getElementById("orders-list");
  try {
    const orders = await api("/orders");
    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><h3>No orders yet</h3><p>Your dog and food orders will show up here.</p><a href="home.html" class="btn btn-primary" style="margin-top:14px;">Start Shopping</a></div>`;
      return;
    }
    el.innerHTML = orders.map(renderOrder).join("");
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function formatDeadline(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function renderOrder(order) {
  const itemsHtml = order.items.map(i => {
    const d = i.details || {};
    const name = d.breed_name || d.product_name || "Item";
    const extra = i.selected_age ? `Age: ${i.selected_age} mo` : (i.selected_weight ? `Weight: ${i.selected_weight} KG` : "");
    return `<div class="summary-row"><span>${name} ${extra ? "(" + extra + ")" : ""} x${i.quantity}</span><span>${formatPrice(i.price * i.quantity)}</span></div>`;
  }).join("");

  // ---- Cancellation ----
  let cancelSection = "";
  if (order.can_cancel) {
    cancelSection = `
      <button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="cancelOrder(${order.id})">❌ Cancel Order</button>
      <p class="helper-text">You can cancel until ${formatDeadline(order.cancel_deadline)} (24 hours after placing the order).</p>`;
  } else if (order.status !== "Cancelled" && order.status !== "Delivered") {
    cancelSection = `<p class="helper-text">Cancellation window closed on ${formatDeadline(order.cancel_deadline)}.</p>`;
  }

  // ---- Return ----
  let returnSection = "";
  if (order.contains_dog) {
    if (order.status === "Delivered") {
      returnSection = `<p class="helper-text">🐾 This order includes a live dog. Dogs can't be returned through this page — please contact PetWorld support directly if there's an issue.</p>`;
    }
  } else if (order.return_request) {
    const rr = order.return_request;
    const badgeClass = {
      Pending: "status-Pending", Approved: "status-Confirmed",
      Rejected: "status-Cancelled", Completed: "status-Delivered",
    }[rr.status] || "status-Pending";
    returnSection = `<p class="helper-text">Return request: <span class="status-badge ${badgeClass}">${rr.status}</span> (submitted ${formatDeadline(rr.request_date)})</p>`;
  } else if (order.can_return) {
    returnSection = `
      <button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="openReturnModal(${order.id})">↩ Request Return</button>
      <p class="helper-text">Eligible for return until ${formatDeadline(order.return_deadline)} (7 days after delivery).</p>`;
  } else if (order.status === "Delivered" && order.return_deadline) {
    returnSection = `<p class="helper-text">Return window closed on ${formatDeadline(order.return_deadline)}.</p>`;
  }

  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>Order #${order.order_id}</h4>
        <span class="status-badge status-${order.status}">${order.status}</span>
      </div>
      <p class="card-meta">Placed on ${new Date(order.order_date).toLocaleString()}</p>
      ${order.delivered_at ? `<p class="card-meta">Delivered on ${formatDeadline(order.delivered_at)}</p>` : ""}
      <p class="card-meta">Deliver to: ${order.delivery_address}</p>
      <p class="card-meta">💳 Paid via: ${order.payment_method || "COD"} ${order.payment_reference ? "(" + order.payment_reference + ")" : ""}</p>
      <div style="margin:10px 0;">${itemsHtml}</div>
      <div class="summary-total" style="margin:0; border:0; padding:0;"><span>Total</span><span>${formatPrice(order.total_amount)}</span></div>
      ${cancelSection}
      ${returnSection}
    </div>
  `;
}

async function cancelOrder(orderId) {
  if (!confirm("Are you sure you want to cancel this order?")) return;
  try {
    await api(`/orders/${orderId}/cancel`, { method: "POST" });
    showToast("Order cancelled.", "success");
    loadOrders();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openReturnModal(orderId) {
  activeReturnOrderId = orderId;
  document.getElementById("return-reason").value = "";
  document.getElementById("return-error").textContent = "";
  document.getElementById("return-modal").style.display = "flex";
}

function closeReturnModal() {
  document.getElementById("return-modal").style.display = "none";
  activeReturnOrderId = null;
}

async function submitReturn() {
  const errorEl = document.getElementById("return-error");
  const reason = document.getElementById("return-reason").value.trim();
  errorEl.textContent = "";
  try {
    await api(`/orders/${activeReturnOrderId}/return`, { method: "POST", body: { reason } });
    showToast("Return request submitted.", "success");
    closeReturnModal();
    loadOrders();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

loadOrders();
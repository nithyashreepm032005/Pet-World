requireCustomer();
renderTopbar("orders");
refreshCartBadge();

let activeReturnOrderId = null;

async function loadOrders() {
  const el = document.getElementById("orders-list");
  try {
    const orders = await api("/orders");
    if (!orders.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">📦</div><h3 data-i18n="orders.empty_title">No orders yet</h3><p data-i18n="orders.empty_text">Your dog and food orders will show up here.</p><a href="home.html" class="btn btn-primary" style="margin-top:14px;" data-i18n="common.start_shopping">Start Shopping</a></div>`;
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
    const name = d.breed_name || d.product_name || t("common.item", "Item");
    const extra = i.selected_age
      ? `<span data-i18n="common.age">Age</span>: ${i.selected_age} <span data-i18n="orders.age_mo">mo</span>`
      : (i.selected_weight ? `<span data-i18n="common.weight">Weight</span>: ${i.selected_weight} KG` : "");
    return `<div class="summary-row"><span>${name} ${extra ? "(" + extra + ")" : ""} x${i.quantity}</span><span>${formatPrice(i.price * i.quantity)}</span></div>`;
  }).join("");

  // ---- Cancellation ----
  let cancelSection = "";
  if (order.can_cancel) {
    cancelSection = `
      <button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="cancelOrder(${order.id})" data-i18n="orders.cancel_order">❌ Cancel Order</button>
      <p class="helper-text"><span data-i18n="orders.cancel_until">You can cancel until</span> ${formatDeadline(order.cancel_deadline)} <span data-i18n="orders.cancel_24h">(24 hours after placing the order).</span></p>`;
  } else if (order.status !== "Cancelled" && order.status !== "Delivered") {
    cancelSection = `<p class="helper-text"><span data-i18n="orders.cancel_closed_on">Cancellation window closed on</span> ${formatDeadline(order.cancel_deadline)}.</p>`;
  }

  // ---- Return ----
  let returnSection = "";
  if (order.contains_dog) {
    if (order.status === "Delivered") {
      returnSection = `<p class="helper-text" data-i18n="orders.dog_return_note">🐾 This order includes a live dog. Dogs can't be returned through this page — please contact PetWorld support directly if there's an issue.</p>`;
    }
  } else if (order.return_request) {
    const rr = order.return_request;
    const badgeClass = {
      Pending: "status-Pending", Approved: "status-Confirmed",
      Rejected: "status-Cancelled", Completed: "status-Delivered",
    }[rr.status] || "status-Pending";
    returnSection = `<p class="helper-text"><span data-i18n="orders.return_request">Return request:</span> <span class="status-badge ${badgeClass}">${rr.status}</span> <span data-i18n="orders.return_submitted">(submitted</span> ${formatDeadline(rr.request_date)})</p>`;
  } else if (order.can_return) {
    returnSection = `
      <button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="openReturnModal(${order.id})" data-i18n="orders.request_return">↩ Request Return</button>
      <p class="helper-text"><span data-i18n="orders.return_eligible_until">Eligible for return until</span> ${formatDeadline(order.return_deadline)} <span data-i18n="orders.return_7days">(7 days after delivery).</span></p>`;
  } else if (order.status === "Delivered" && order.return_deadline) {
    returnSection = `<p class="helper-text"><span data-i18n="orders.return_closed_on">Return window closed on</span> ${formatDeadline(order.return_deadline)}.</p>`;
  }

  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4><span data-i18n="orders.order_no">Order #</span>${order.order_id}</h4>
        <span class="status-badge status-${order.status}">${order.status}</span>
      </div>
      <p class="card-meta"><span data-i18n="orders.placed_on">Placed on</span> ${new Date(order.order_date).toLocaleString()}</p>
      ${order.delivered_at ? `<p class="card-meta"><span data-i18n="orders.delivered_on">Delivered on</span> ${formatDeadline(order.delivered_at)}</p>` : ""}
      <p class="card-meta"><span data-i18n="orders.deliver_to">Deliver to:</span> ${order.delivery_address}</p>
      <p class="card-meta"><span data-i18n="common.paid_via">💳 Paid via:</span> ${order.payment_method || "COD"} ${order.payment_reference ? "(" + order.payment_reference + ")" : ""}</p>
      <div style="margin:10px 0;">${itemsHtml}</div>
      <div class="summary-total" style="margin:0; border:0; padding:0;"><span data-i18n="common.total">Total</span><span>${formatPrice(order.total_amount)}</span></div>
      ${cancelSection}
      ${returnSection}
    </div>
  `;
}

async function cancelOrder(orderId) {
  if (!confirm(t("orders.cancel_confirm", "Are you sure you want to cancel this order?"))) return;
  try {
    await api(`/orders/${orderId}/cancel`, { method: "POST" });
    showToast(t("orders.cancelled", "Order cancelled."), "success");
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
    showToast(t("orders.return_done", "Return request submitted."), "success");
    closeReturnModal();
    loadOrders();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

loadOrders();
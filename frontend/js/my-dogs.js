requireCustomer();
renderTopbar("account");
refreshCartBadge();

let myDogsCache = [];

async function loadMyDogs() {
  const el = document.getElementById("my-dogs-list");
  try {
    myDogsCache = await api("/my-dogs");
    if (!myDogsCache.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">🐕</div><h3 data-i18n="my_dogs.empty_title">No dogs added yet</h3><p data-i18n="my_dogs.empty_text">Add your dog to start tracking its vaccination schedule.</p></div>`;
      return;
    }
    el.innerHTML = myDogsCache.map(renderDogCard).join("");
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderDogCard(dog) {
  const overdueBadge = dog.vaccination_overdue
    ? `<span class="status-badge status-Cancelled" data-i18n="my_dogs.overdue">Overdue</span>`
    : (dog.next_vaccination_date ? `<span class="status-badge status-Confirmed" data-i18n="my_dogs.on_track">On Track</span>` : "");

  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>🐶 ${dog.name}${dog.breed ? " — " + dog.breed : ""}</h4>
        ${overdueBadge}
      </div>
      <p class="card-meta"><span data-i18n="my_dogs.vacc_date_label">Vaccination Date:</span> ${dog.vaccination_date || t("common.not_set", "Not set")}</p>
      <p class="card-meta"><span data-i18n="my_dogs.next_due_label">Next Vaccination Due:</span> ${dog.next_vaccination_date || t("common.not_set", "Not set")}</p>
      ${dog.notes ? `<p class="card-meta"><span data-i18n="my_dogs.notes_label">Notes:</span> ${dog.notes}</p>` : ""}
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" onclick="openEditModal(${dog.id})" data-i18n="common.edit">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDog(${dog.id})" data-i18n="common.remove">Remove</button>
      </div>
    </div>
  `;
}

function openAddModal() {
  document.getElementById("dog-form").reset();
  document.getElementById("dog-id").value = "";
  document.getElementById("dog-interval").value = 365;
  setI18nText(document.getElementById("dog-modal-title"), "my_dogs.modal_add", "Add Dog");
  document.getElementById("dog-error").textContent = "";
  document.getElementById("dog-modal").style.display = "flex";
}

function openEditModal(dogId) {
  const dog = myDogsCache.find(d => d.id === dogId);
  document.getElementById("dog-id").value = dog.id;
  document.getElementById("dog-name").value = dog.name;
  document.getElementById("dog-breed").value = dog.breed || "";
  document.getElementById("dog-vacc-date").value = dog.vaccination_date || "";
  document.getElementById("dog-interval").value = 365;
  document.getElementById("dog-notes").value = dog.notes || "";
  setI18nText(document.getElementById("dog-modal-title"), "my_dogs.modal_edit", "Edit Dog");
  document.getElementById("dog-error").textContent = "";
  document.getElementById("dog-modal").style.display = "flex";
}

function closeDogModal() {
  document.getElementById("dog-modal").style.display = "none";
}

document.getElementById("dog-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("dog-error");
  errorEl.textContent = "";

  const dogId = document.getElementById("dog-id").value;
  const payload = {
    name: document.getElementById("dog-name").value.trim(),
    breed: document.getElementById("dog-breed").value.trim(),
    vaccination_date: document.getElementById("dog-vacc-date").value || null,
    interval_days: parseInt(document.getElementById("dog-interval").value, 10) || 365,
    notes: document.getElementById("dog-notes").value.trim(),
  };

  try {
    if (dogId) {
      await api(`/my-dogs/${dogId}`, { method: "PUT", body: payload });
    } else {
      await api("/my-dogs", { method: "POST", body: payload });
    }
    closeDogModal();
    showToast(t("my_dogs.saved", "Saved!"), "success");
    loadMyDogs();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function deleteDog(dogId) {
  if (!confirm(t("my_dogs.confirm_remove", "Remove this dog's record?"))) return;
  try {
    await api(`/my-dogs/${dogId}`, { method: "DELETE" });
    showToast(t("my_dogs.removed", "Removed"));
    loadMyDogs();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadMyDogs();
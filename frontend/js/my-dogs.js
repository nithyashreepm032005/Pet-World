requireCustomer();
renderTopbar("account");
refreshCartBadge();

let myDogsCache = [];

async function loadMyDogs() {
  const el = document.getElementById("my-dogs-list");
  try {
    myDogsCache = await api("/my-dogs");
    if (!myDogsCache.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">🐕</div><h3 data-i18n="my_dogs.empty_title">No dogs added yet</h3><p data-i18n="my_dogs.empty_text">Add your dog to keep your own private list.</p></div>`;
      return;
    }
    el.innerHTML = myDogsCache.map(renderDogCard).join("");
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderDogCard(dog) {
  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>🐶 ${dog.name}${dog.breed ? " — " + dog.breed : ""}</h4>
      </div>
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
  setI18nText(document.getElementById("dog-modal-title"), "my_dogs.modal_add", "Add Dog");
  document.getElementById("dog-error").textContent = "";
  document.getElementById("dog-modal").style.display = "flex";
}

function openEditModal(dogId) {
  const dog = myDogsCache.find(d => d.id === dogId);
  document.getElementById("dog-id").value = dog.id;
  document.getElementById("dog-name").value = dog.name;
  document.getElementById("dog-breed").value = dog.breed || "";
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

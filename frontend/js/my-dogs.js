requireCustomer();
renderTopbar("account");
refreshCartBadge();

let myDogsCache = [];

async function loadMyDogs() {
  const el = document.getElementById("my-dogs-list");
  try {
    myDogsCache = await api("/my-dogs");
    if (!myDogsCache.length) {
      el.innerHTML = `<div class="empty-state"><div class="emoji">🐕</div><h3>No dogs added yet</h3><p>Add your dog to start tracking its vaccination schedule.</p></div>`;
      return;
    }
    el.innerHTML = myDogsCache.map(renderDogCard).join("");
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>${err.message}</h3></div>`;
  }
}

function renderDogCard(dog) {
  const overdueBadge = dog.vaccination_overdue
    ? `<span class="status-badge status-Cancelled">Overdue</span>`
    : (dog.next_vaccination_date ? `<span class="status-badge status-Confirmed">On Track</span>` : "");

  return `
    <div class="list-card">
      <div class="list-card-head">
        <h4>🐶 ${dog.name}${dog.breed ? " — " + dog.breed : ""}</h4>
        ${overdueBadge}
      </div>
      <p class="card-meta">Vaccination Date: ${dog.vaccination_date || "Not set"}</p>
      <p class="card-meta">Next Vaccination Due: ${dog.next_vaccination_date || "Not set"}</p>
      ${dog.notes ? `<p class="card-meta">Notes: ${dog.notes}</p>` : ""}
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" onclick="openEditModal(${dog.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDog(${dog.id})">Remove</button>
      </div>
    </div>
  `;
}

function openAddModal() {
  document.getElementById("dog-form").reset();
  document.getElementById("dog-id").value = "";
  document.getElementById("dog-interval").value = 365;
  document.getElementById("dog-modal-title").textContent = "Add Dog";
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
  document.getElementById("dog-modal-title").textContent = "Edit Dog";
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
    showToast("Saved!", "success");
    loadMyDogs();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function deleteDog(dogId) {
  if (!confirm("Remove this dog's record?")) return;
  try {
    await api(`/my-dogs/${dogId}`, { method: "DELETE" });
    showToast("Removed");
    loadMyDogs();
  } catch (err) {
    showToast(err.message, "error");
  }
}

loadMyDogs();
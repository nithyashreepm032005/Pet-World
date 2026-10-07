requireCustomer();
renderTopbar("account");
refreshCartBadge();

async function loadAccount() {
  try {
    const user = await api("/account");
    document.getElementById("avatar-initial").textContent = user.full_name.charAt(0).toUpperCase();
    document.getElementById("sidebar-name").textContent = user.full_name;
    document.getElementById("sidebar-userid").textContent = user.user_id;
    document.getElementById("a-userid").value = user.user_id;
    document.getElementById("a-name").value = user.full_name;
    document.getElementById("a-email").value = user.email;
    document.getElementById("a-phone").value = user.phone;
    document.getElementById("a-address").value = user.address || "";
    setSession(getToken(), user); // refresh cached user
  } catch (err) {
    showToast(err.message, "error");
  }
}

document.getElementById("account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("account-error");
  const successEl = document.getElementById("account-success");
  errorEl.textContent = "";
  successEl.textContent = "";

  try {
    const user = await api("/account", {
      method: "PUT",
      body: {
        full_name: document.getElementById("a-name").value.trim(),
        phone: document.getElementById("a-phone").value.trim(),
        address: document.getElementById("a-address").value.trim(),
      },
    });
    setSession(getToken(), user);
    successEl.textContent = "Profile updated successfully!";
    document.getElementById("sidebar-name").textContent = user.full_name;
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("logout-link").addEventListener("click", (e) => {
  e.preventDefault();
  clearSession();
  window.location.href = "index.html";
});

loadAccount();

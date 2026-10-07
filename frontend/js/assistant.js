// ===================== PetWorld AI Assistant =====================
// Floating "PetWorld Dashboard Guide" widget. It talks to the backend
// endpoint POST /api/assistant/chat (see backend/routes/assistant.py),
// which knows the real pages of this app and answers in the active
// language. Nothing here touches user data - it only navigates.

const PW_ASSISTED_PAGES = [
  "home.html",
  "dogs.html",
  "food.html",
  "services.html",
  "book-service.html",
  "bookings.html",
  "track-service.html",
  "my-dogs.html",
  "orders.html",
  "cart.html",
  "checkout.html",
  "favourites.html",
  "account.html",
  "admin.html",
  "employee.html",
];

const PW_SUGGESTIONS_FALLBACK = [
  "Where can I book a service?",
  "How do I add my dog?",
  "Where can I see my bookings?",
  "How do I buy dog food?",
  "How can I edit my profile?",
  "I don't understand this dashboard.",
];

let PW_ASSISTANT_BUSY = false;
let PW_ASSISTANT_GREETED = false;
let PW_ASSISTANT_SUGGESTIONS = null; // follow-ups suggested by the last reply

function pwAssistantAllowedHref(href) {
  if (typeof href !== "string" || href.length > 120) return false;
  const [page, query] = href.split("?");
  if (PW_ASSISTED_PAGES.indexOf(page) < 0) return false;
  if (query && !/^[a-z_]+=\d+$/.test(query)) return false;
  return true;
}

function pwAssistantText(key, fallback) {
  return typeof t === "function" ? t(key, fallback) : fallback;
}

function pwAssistantSuggestions() {
  if (PW_ASSISTANT_SUGGESTIONS && PW_ASSISTANT_SUGGESTIONS.length) {
    return PW_ASSISTANT_SUGGESTIONS;
  }
  const list = typeof t === "function" ? t("assistant.suggested") : null;
  return Array.isArray(list) && list.length ? list : PW_SUGGESTIONS_FALLBACK;
}

function pwAssistantAddMessage(text, who, opts = {}) {
  const box = document.getElementById("pw-assistant-messages");
  if (!box) return null;
  const msg = document.createElement("div");
  msg.className = "pw-msg " + who;
  if (opts.error) msg.classList.add("error");
  if (opts.translateKey) {
    msg.setAttribute("data-i18n", opts.translateKey);
    msg.textContent = text;
  } else {
    msg.textContent = text;
  }
  box.appendChild(msg);

  if (Array.isArray(opts.actions) && opts.actions.length) {
    const actions = document.createElement("div");
    actions.className = "pw-msg-actions";
    opts.actions.forEach((action) => {
      if (!action || !pwAssistantAllowedHref(action.href)) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-msg-action";
      btn.textContent = action.label || action.href;
      btn.addEventListener("click", () => (window.location.href = action.href));
      actions.appendChild(btn);
    });
    if (actions.children.length) box.appendChild(actions);
  }
  box.scrollTop = box.scrollHeight;
  return msg;
}

function pwAssistantShowTyping(show) {
  const box = document.getElementById("pw-assistant-messages");
  if (!box) return;
  let typing = document.getElementById("pw-assistant-typing");
  if (show && !typing) {
    typing = document.createElement("div");
    typing.id = "pw-assistant-typing";
    typing.className = "pw-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    typing.setAttribute("title", pwAssistantText("assistant.thinking", "Thinking…"));
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;
  } else if (!show && typing) {
    typing.remove();
  }
}

function pwAssistantRenderSuggestions() {
  const wrap = document.getElementById("pw-assistant-suggestions");
  if (!wrap) return;
  wrap.innerHTML = "";
  const label = document.createElement("div");
  label.className = "pw-suggestions-label";
  label.setAttribute("data-i18n", "assistant.suggestions_label");
  label.textContent = pwAssistantText("assistant.suggestions_label", "Try asking:");
  wrap.appendChild(label);
  pwAssistantSuggestions().forEach((q) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-suggestion";
    btn.textContent = q;
    btn.addEventListener("click", () => pwAssistantSend(q));
    wrap.appendChild(btn);
  });
  if (typeof applyI18n === "function") applyI18n(wrap);
}

async function pwAssistantSend(message) {
  const input = document.getElementById("pw-assistant-text");
  const sendBtn = document.getElementById("pw-assistant-send");
  const text = (message || (input ? input.value : "")).trim();
  if (!text || PW_ASSISTANT_BUSY) return;

  pwAssistantOpen();
  if (input) input.value = "";
  pwAssistantAddMessage(text, "user");
  PW_ASSISTANT_BUSY = true;
  if (sendBtn) sendBtn.disabled = true;
  pwAssistantShowTyping(true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API_BASE}/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        language: typeof getPwLang === "function" ? getPwLang() : "en",
        page: window.location.pathname.split("/").pop() || "home.html",
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "request failed");
    pwAssistantShowTyping(false);
    pwAssistantAddMessage(data.reply || pwAssistantText("assistant.error", "Sorry, I couldn't reach the assistant. Please try again."), "bot", {
      actions: data.actions,
    });
    PW_ASSISTANT_SUGGESTIONS =
      Array.isArray(data.suggestions) && data.suggestions.length ? data.suggestions : null;
    pwAssistantRenderSuggestions();
  } catch (err) {
    pwAssistantShowTyping(false);
    pwAssistantAddMessage(
      pwAssistantText("assistant.error", "Sorry, I couldn't reach the assistant. Please try again."),
      "bot",
      { error: true }
    );
  } finally {
    PW_ASSISTANT_BUSY = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.focus();
  }
}

function pwAssistantOpen() {
  const panel = document.getElementById("pw-assistant-panel");
  const fab = document.getElementById("pw-assistant-fab");
  if (!panel) return;
  panel.hidden = false;
  if (fab) fab.style.display = "none";
  if (!PW_ASSISTANT_GREETED) {
    PW_ASSISTANT_GREETED = true;
    pwAssistantAddMessage(
      pwAssistantText("assistant.greeting", "Hi! I'm your PetWorld dashboard guide. Ask me where to find anything — bookings, grooming, dogs, food, my profile and more."),
      "bot",
      { translateKey: "assistant.greeting" }
    );
  }
  pwAssistantRenderSuggestions();
  const input = document.getElementById("pw-assistant-text");
  if (input) input.focus();
}

function pwAssistantClose() {
  const panel = document.getElementById("pw-assistant-panel");
  const fab = document.getElementById("pw-assistant-fab");
  if (panel) panel.hidden = true;
  if (fab) fab.style.display = "";
}

function pwAssistantInit() {
  if (document.getElementById("pw-assistant")) return;

  const root = document.createElement("div");
  root.id = "pw-assistant";
  root.innerHTML = `
    <button type="button" class="pw-assistant-fab" id="pw-assistant-fab">
      <span class="fab-icon">💬</span>
      <span data-i18n="assistant.button">AI Assistant</span>
    </button>
    <div class="pw-assistant-panel" id="pw-assistant-panel" hidden>
      <div class="pw-assistant-head">
        <div>
          <div class="pw-assistant-title" data-i18n="assistant.title">🐾 PetWorld Assistant</div>
          <div class="pw-assistant-sub" data-i18n="assistant.subtitle">Your dashboard guide</div>
        </div>
        <button type="button" class="pw-assistant-close" id="pw-assistant-close" aria-label="Close">&times;</button>
      </div>
      <div class="pw-assistant-messages" id="pw-assistant-messages"></div>
      <div class="pw-assistant-suggestions" id="pw-assistant-suggestions"></div>
      <form class="pw-assistant-input" id="pw-assistant-form">
        <input id="pw-assistant-text" type="text" autocomplete="off"
               data-i18n-ph="assistant.placeholder" placeholder="Ask about the dashboard…">
        <button type="submit" id="pw-assistant-send" data-i18n="assistant.send">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(root);
  if (typeof applyI18n === "function") applyI18n(root);

  document.getElementById("pw-assistant-fab").addEventListener("click", pwAssistantOpen);
  document.getElementById("pw-assistant-close").addEventListener("click", pwAssistantClose);
  document.getElementById("pw-assistant-form").addEventListener("submit", (e) => {
    e.preventDefault();
    pwAssistantSend();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") pwAssistantClose();
  });
  document.addEventListener("pw:langchange", () => {
    PW_ASSISTANT_SUGGESTIONS = null;
    pwAssistantRenderSuggestions();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", pwAssistantInit);
} else {
  pwAssistantInit();
}

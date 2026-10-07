// ===================== PetWorld i18n (multi-language) =====================
// Loads translation dictionaries from frontend/translations/*.json, replaces
// any element carrying a data-i18n / data-i18n-ph attribute, and remembers
// the chosen language in localStorage so it survives page navigation.
//
//   <span data-i18n="account.title">My Account</span>          -> text
//   <input data-i18n-ph="common.select_city" placeholder="…"> -> placeholder
//
// English text already in the HTML stays as the fallback, so nothing breaks
// when no language is selected (or if the JSON files cannot be fetched).
const PW_LANGS = ["en", "kn", "hi"];
const PW_DEFAULT_LANG = "en";
const PW_I18N_DICTS = {}; // lang -> parsed JSON dictionary
let PW_I18N_APPLY_QUEUED = false;

function getPwLang() {
  const stored = localStorage.getItem("pw_lang");
  return PW_LANGS.indexOf(stored) >= 0 ? stored : PW_DEFAULT_LANG;
}

function pwLookup(dict, path) {
  if (!dict) return undefined;
  let node = dict;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node === undefined || node === null || node === "" ? undefined : node;
}

// t("account.title", "My Account") -> translation for the active language,
// falling back to English, then to the supplied English fallback, then the key.
function t(key, fallback) {
  const value = pwLookup(PW_I18N_DICTS[getPwLang()], key);
  if (value !== undefined) return value;
  const english = pwLookup(PW_I18N_DICTS.en, key);
  if (english !== undefined) return english;
  return fallback !== undefined ? fallback : key;
}

function setI18nText(el, key, fallback) {
  if (!el) return;
  el.setAttribute("data-i18n", key);
  if (fallback !== undefined) {
    el.dataset.pwOrig = fallback;
    if (el.textContent !== fallback) el.textContent = fallback;
  }
  applyI18n(el.parentNode || el);
}

function pwApplyElement(el) {
  if (el.hasAttribute("data-i18n")) {
    if (el.dataset.pwOrig === undefined) el.dataset.pwOrig = el.textContent;
    const key = el.getAttribute("data-i18n");
    const translated = pwLookup(PW_I18N_DICTS[getPwLang()], key);
    const text = translated !== undefined ? translated : el.dataset.pwOrig;
    if (el.textContent !== text) el.textContent = text;
  }
  const phKey = el.getAttribute("data-i18n-ph");
  if (phKey) {
    if (el.dataset.pwOrigPh === undefined) {
      el.dataset.pwOrigPh = el.getAttribute("placeholder") || "";
    }
    const translated = pwLookup(PW_I18N_DICTS[getPwLang()], phKey);
    const text = translated !== undefined ? translated : el.dataset.pwOrigPh;
    if (el.getAttribute("placeholder") !== text) el.setAttribute("placeholder", text);
  }
}

function applyI18n(root) {
  const scope = root && root.querySelectorAll ? root : document;
  if (scope.nodeType === 1 && (scope.hasAttribute("data-i18n") || scope.hasAttribute("data-i18n-ph"))) {
    pwApplyElement(scope);
  }
  if (!scope.querySelectorAll) return;
  scope
    .querySelectorAll("[data-i18n], [data-i18n-ph]")
    .forEach((el) => pwApplyElement(el));
}

function pwQueueApply() {
  if (PW_I18N_APPLY_QUEUED) return;
  PW_I18N_APPLY_QUEUED = true;
  requestAnimationFrame(() => {
    PW_I18N_APPLY_QUEUED = false;
    applyI18n();
  });
}

async function pwLoadLang(lang) {
  if (PW_I18N_DICTS[lang]) return;
  // Cached copy first so later pages translate instantly, even offline.
  try {
    const cached = localStorage.getItem("pw_i18n_" + lang);
    if (cached) {
      PW_I18N_DICTS[lang] = JSON.parse(cached);
      pwQueueApply();
    }
  } catch (e) { /* corrupted cache - ignore */ }
  try {
    const res = await fetch(`translations/${lang}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    PW_I18N_DICTS[lang] = data;
    localStorage.setItem("pw_i18n_" + lang, JSON.stringify(data));
    pwQueueApply();
  } catch (e) {
    // No dictionary for this language - English/fallback text stays visible.
  }
}

function setPwLang(lang) {
  if (PW_LANGS.indexOf(lang) < 0) lang = PW_DEFAULT_LANG;
  localStorage.setItem("pw_lang", lang);
  document.documentElement.lang = lang;
  pwLoadLang(lang).then(() => {
    applyI18n();
    document.dispatchEvent(new CustomEvent("pw:langchange", { detail: { lang } }));
  });
}

// Markup for the language selector (rendered inside the shared topbar and
// on the admin/login headers).
function pwLangSelectHTML() {
  const current = getPwLang();
  const options = PW_LANGS.map((code) => {
    const label =
      code === "en" ? "English" : code === "kn" ? "ಕನ್ನಡ" : "हिन्दी";
    return `<option value="${code}" ${code === current ? "selected" : ""}>${label}</option>`;
  });
  return `<label class="lang-switch"><span class="lang-globe" aria-hidden="true">🌐</span><select class="pw-lang-select" aria-label="Language">${options.join("")}</select></label>`;
}

function pwMountLangSelects() {
  document.querySelectorAll("select.pw-lang-select").forEach((sel) => {
    sel.value = getPwLang();
  });
}

// Single delegated listener so every selector on the page works without
// needing its own inline handler.
document.addEventListener("change", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("pw-lang-select")) {
    setPwLang(e.target.value);
  }
});

function pwInitI18n() {
  const lang = getPwLang();
  document.documentElement.lang = lang;
  pwLoadLang("en");
  if (lang !== PW_DEFAULT_LANG) pwLoadLang(lang);

  if (document.body) {
    applyI18n();
    // Covers content rendered later by page scripts (grids, lists, modals).
    new MutationObserver(() => pwQueueApply()).observe(document.body, {
      childList: true,
      subtree: true,
    });
    pwMountLangSelects();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", pwInitI18n);
} else {
  pwInitI18n();
}

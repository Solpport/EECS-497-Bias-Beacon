const DEFAULT_SETTINGS = {
  apiKey: "",
  sensitivity: "medium",
  categories: {
    emotional_language: true,
    exaggeration: true,
    stereotype: true,
    generalization: true,
    false_equivalence: true
  },
  highlightStyle: "highlight",
  autoAnalyze: false,
  domainWhitelist: ""
};

const SENSITIVITY_LABELS = ["Low", "Medium", "High"];
const SENSITIVITY_VALUES = ["low", "medium", "high"];

const apiKeyInput = document.getElementById("apiKey");
const toggleApiKeyButton = document.getElementById("toggleApiKey");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const sensitivitySlider = document.getElementById("sensitivity");
const sensitivityLabel = document.getElementById("sensitivityLabel");
const autoAnalyzeCheckbox = document.getElementById("autoAnalyze");
const domainWhitelistTextarea = document.getElementById("domainWhitelist");
const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");
const saveStatus = document.getElementById("saveStatus");

const categoryCheckboxes = {
  emotional_language: document.getElementById("cat_emotional_language"),
  exaggeration: document.getElementById("cat_exaggeration"),
  stereotype: document.getElementById("cat_stereotype"),
  generalization: document.getElementById("cat_generalization"),
  false_equivalence: document.getElementById("cat_false_equivalence")
};

function setHighlightStyleRadio(value) {
  const radio = document.querySelector(`input[name="highlightStyle"][value="${value}"]`);
  if (radio) {
    radio.checked = true;
  }
}

function getHighlightStyleValue() {
  const checked = document.querySelector('input[name="highlightStyle"]:checked');
  return checked ? checked.value : "highlight";
}

function updateApiKeyStatus(key) {
  if (!key) {
    apiKeyStatus.textContent = "No API key set. Will use default key if available.";
    apiKeyStatus.className = "setting-hint status-warning";
  } else if (key.startsWith("sk-")) {
    apiKeyStatus.textContent = "API key is set.";
    apiKeyStatus.className = "setting-hint status-ok";
  } else {
    apiKeyStatus.textContent = "API key format looks incorrect (should start with sk-).";
    apiKeyStatus.className = "setting-hint status-error";
  }
}

async function loadSettings() {
  const result = await chrome.storage.sync.get("settings");
  const settings = { ...DEFAULT_SETTINGS, ...result.settings };

  apiKeyInput.value = settings.apiKey;

  const sensIndex = SENSITIVITY_VALUES.indexOf(settings.sensitivity);
  sensitivitySlider.value = sensIndex >= 0 ? sensIndex : 1;
  sensitivityLabel.textContent = SENSITIVITY_LABELS[sensitivitySlider.value];

  Object.keys(categoryCheckboxes).forEach((key) => {
    if (categoryCheckboxes[key]) {
      categoryCheckboxes[key].checked = settings.categories?.[key] ?? true;
    }
  });

  setHighlightStyleRadio(settings.highlightStyle || "highlight");
  autoAnalyzeCheckbox.checked = settings.autoAnalyze || false;
  domainWhitelistTextarea.value = settings.domainWhitelist || "";

  updateApiKeyStatus(settings.apiKey);
}

function showSaveStatus(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = `save-status status-${type}`;
  setTimeout(() => {
    saveStatus.textContent = "";
    saveStatus.className = "save-status";
  }, 3000);
}

async function saveSettings() {
  const anyCategory = Object.values(categoryCheckboxes).some((cb) => cb?.checked);
  if (!anyCategory) {
    showSaveStatus("Enable at least one bias category.", "error");
    return;
  }

  const categories = {};
  Object.keys(categoryCheckboxes).forEach((key) => {
    categories[key] = categoryCheckboxes[key]?.checked ?? true;
  });

  const settings = {
    apiKey: apiKeyInput.value.trim(),
    sensitivity: SENSITIVITY_VALUES[sensitivitySlider.value] || "medium",
    categories,
    highlightStyle: getHighlightStyleValue(),
    autoAnalyze: autoAnalyzeCheckbox.checked,
    domainWhitelist: domainWhitelistTextarea.value.trim()
  };

  await chrome.storage.sync.set({ settings });
  showSaveStatus("Settings saved!", "ok");
  updateApiKeyStatus(settings.apiKey);
}

async function resetSettings() {
  await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  await loadSettings();
  showSaveStatus("Settings reset to defaults.", "ok");
}

sensitivitySlider.addEventListener("input", () => {
  sensitivityLabel.textContent = SENSITIVITY_LABELS[sensitivitySlider.value];
});

toggleApiKeyButton.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleApiKeyButton.textContent = isPassword ? "Hide" : "Show";
});

apiKeyInput.addEventListener("input", () => {
  updateApiKeyStatus(apiKeyInput.value.trim());
});

saveButton.addEventListener("click", saveSettings);
resetButton.addEventListener("click", resetSettings);

loadSettings();

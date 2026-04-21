const DEFAULT_SETTINGS = {
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

async function loadSettings() {
  const result = await chrome.storage.sync.get("settings");
  const settings = { ...DEFAULT_SETTINGS, ...result.settings };

  const sensIndex = SENSITIVITY_VALUES.indexOf(settings.sensitivity);
  sensitivitySlider.value = sensIndex >= 0 ? sensIndex : 1;
  sensitivityLabel.textContent = SENSITIVITY_LABELS[sensitivitySlider.value];

  Object.keys(categoryCheckboxes).forEach((key) => {
    if (categoryCheckboxes[key]) {
      categoryCheckboxes[key].checked = settings.categories?.[key] ?? true;
    }
  });

  setHighlightStyleRadio(settings.highlightStyle || "highlight");
  if (autoAnalyzeCheckbox) autoAnalyzeCheckbox.checked = settings.autoAnalyze || false;
  if (domainWhitelistTextarea) domainWhitelistTextarea.value = settings.domainWhitelist || "";
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
    sensitivity: SENSITIVITY_VALUES[sensitivitySlider.value] || "medium",
    categories,
    highlightStyle: getHighlightStyleValue(),
    autoAnalyze: autoAnalyzeCheckbox ? autoAnalyzeCheckbox.checked : false,
    domainWhitelist: domainWhitelistTextarea ? domainWhitelistTextarea.value.trim() : ""
  };

  await chrome.storage.sync.set({ settings });
  showSaveStatus("Settings saved!", "ok");
}

async function resetSettings() {
  await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  await loadSettings();
  showSaveStatus("Settings reset to defaults.", "ok");
}

sensitivitySlider.addEventListener("input", () => {
  sensitivityLabel.textContent = SENSITIVITY_LABELS[sensitivitySlider.value];
});

saveButton.addEventListener("click", saveSettings);
resetButton.addEventListener("click", resetSettings);

loadSettings();

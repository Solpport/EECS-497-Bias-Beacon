const analyzeButton = document.getElementById("analyzeButton");
const resultText = document.getElementById("resultText");
const summarySection = document.getElementById("summarySection");
const biasedCountValue = document.getElementById("biasedCountValue");
const totalCountValue = document.getElementById("totalCountValue");
const emotionalCountValue = document.getElementById("emotionalCountValue");
const exaggerationCountValue = document.getElementById("exaggerationCountValue");
const stereotypeCountValue = document.getElementById("stereotypeCountValue");
const generalizationCountValue = document.getElementById("generalizationCountValue");
const falseEquivalenceCountValue = document.getElementById("falseEquivalenceCountValue");
const biasLevelValue = document.getElementById("biasLevelValue");
const biasPercentValue = document.getElementById("biasPercentValue");
const biasScoreFill = document.getElementById("biasScoreFill");
const settingsButton = document.getElementById("settingsButton");
const exportSection = document.getElementById("exportSection");
const exportJSONButton = document.getElementById("exportJSON");
const exportCSVButton = document.getElementById("exportCSV");
let analysisRunning = false;
let lastAnalysisResults = null;

function getBiasBarClassName(biasLevel) {
  if (biasLevel === "Low bias") {
    return "bias-score-fill bias-score-fill--low";
  }
  if (biasLevel === "Moderate bias") {
    return "bias-score-fill bias-score-fill--moderate";
  }
  if (biasLevel === "High bias") {
    return "bias-score-fill bias-score-fill--high";
  }
  return "bias-score-fill bias-score-fill--extreme";
}

function renderSummary(response) {
  const count = response?.count ?? 0;
  const totalSentences = response?.totalSentences ?? 0;
  const biasScore = response?.biasScore ?? 0;
  const biasLevel = response?.biasLevel ?? "Low bias";
  const categoryCounts = response?.categoryCounts ?? {};
  const biasPercent = Math.round(biasScore * 100);

  resultText.textContent = `${count} potentially biased sentence${count === 1 ? "" : "s"} detected.`;

  if (biasedCountValue) {
    biasedCountValue.textContent = String(count);
  }
  if (totalCountValue) {
    totalCountValue.textContent = String(totalSentences);
  }
  if (emotionalCountValue) {
    emotionalCountValue.textContent = String(categoryCounts.emotional_language ?? 0);
  }
  if (exaggerationCountValue) {
    exaggerationCountValue.textContent = String(categoryCounts.exaggeration ?? 0);
  }
  if (stereotypeCountValue) {
    stereotypeCountValue.textContent = String(categoryCounts.stereotype ?? 0);
  }
  if (generalizationCountValue) {
    generalizationCountValue.textContent = String(categoryCounts.generalization ?? 0);
  }
  if (falseEquivalenceCountValue) {
    falseEquivalenceCountValue.textContent = String(categoryCounts.false_equivalence ?? 0);
  }
  if (biasLevelValue) {
    biasLevelValue.textContent = biasLevel;
  }
  if (biasPercentValue) {
    biasPercentValue.textContent = `${biasPercent}%`;
  }
  if (biasScoreFill) {
    biasScoreFill.style.width = `${biasPercent}%`;
    biasScoreFill.className = getBiasBarClassName(biasLevel);
  }
  if (summarySection) {
    summarySection.hidden = false;
  }
}

async function sendAnalyzeMessage(tabId) {
  console.log("Sending ANALYZE_PAGE message:", tabId);
  return chrome.tabs.sendMessage(tabId, {
    type: "ANALYZE_PAGE"
  }, {
    frameId: 0
  });
}

async function ensureContentScriptInjected(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId, frameIds: [0] },
    files: ["styles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ["content.js"]
  });
}

async function analyzeActiveTab() {
  if (!resultText || !analyzeButton) {
    return;
  }

  if (analysisRunning) {
    return;
  }

  analysisRunning = true;
  analyzeButton.disabled = true;
  resultText.textContent = "Analyzing page...";

  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!activeTab?.id) {
      resultText.textContent = "No active tab available.";
      return;
    }

    if (
      activeTab.url?.startsWith("chrome://") ||
      activeTab.url?.startsWith("chrome-extension://") ||
      activeTab.url?.startsWith("edge://") ||
      activeTab.url?.startsWith("about:")
    ) {
      resultText.textContent = "Cannot analyze Chrome internal pages.";
      return;
    }

    let response;

    try {
      response = await sendAnalyzeMessage(activeTab.id);
    } catch (error) {
      if (!String(error?.message || "").includes("Receiving end does not exist")) {
        throw error;
      }

      await ensureContentScriptInjected(activeTab.id);
      response = await sendAnalyzeMessage(activeTab.id);
    }

    if (!response) {
      resultText.textContent = "No response from page.";
      return;
    }

    lastAnalysisResults = response;
    renderSummary(response);

    if (exportSection && response?.detailedResults?.length) {
      exportSection.hidden = false;
    }
  } catch (error) {
    resultText.textContent = "Unable to analyze this page.";
    console.error("Bias Beacon analysis failed:", error);
  } finally {
    analysisRunning = false;
    analyzeButton.disabled = false;
  }
}

if (analyzeButton) {
  analyzeButton.onclick = analyzeActiveTab;
}

if (settingsButton) {
  settingsButton.onclick = () => {
    chrome.runtime.openOptionsPage();
  };
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

if (exportJSONButton) {
  exportJSONButton.onclick = () => {
    if (!lastAnalysisResults?.detailedResults) {
      return;
    }
    const data = JSON.stringify(lastAnalysisResults.detailedResults, null, 2);
    downloadFile(data, "bias-beacon-results.json", "application/json");
  };
}

if (exportCSVButton) {
  exportCSVButton.onclick = () => {
    if (!lastAnalysisResults?.detailedResults) {
      return;
    }
    const header = "Sentence,Bias Type\n";
    const rows = lastAnalysisResults.detailedResults
      .map((r) => `"${r.sentence.replace(/"/g, '""')}","${r.bias_type || ""}"`)
      .join("\n");
    downloadFile(header + rows, "bias-beacon-results.csv", "text/csv");
  };
}

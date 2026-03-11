const analyzeButton = document.getElementById("analyzeButton");
const resultText = document.getElementById("resultText");

async function analyzeActiveTab() {
  if (!resultText || !analyzeButton) {
    return;
  }

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

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "ANALYZE_PAGE"
    });

    const count = response?.count ?? 0;
    resultText.textContent = `${count} potentially biased sentence${count === 1 ? "" : "s"} detected.`;
  } catch (error) {
    resultText.textContent = "Unable to analyze this page.";
    console.error("Bias Beacon analysis failed:", error);
  } finally {
    analyzeButton.disabled = false;
  }
}

if (analyzeButton) {
  analyzeButton.addEventListener("click", analyzeActiveTab);
}

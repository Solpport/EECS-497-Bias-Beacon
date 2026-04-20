if (!globalThis.__biasBeaconContentInitialized) {
  globalThis.__biasBeaconContentInitialized = true;

  const ORIGINAL_TEXT_ATTR = "data-bias-beacon-original-text";
  const TOOLTIP_TEXT = "This sentence may contain emotionally loaded or biased language.";
  const CATEGORY_LABELS = {
    emotional_language: "Emotional Language",
    exaggeration: "Exaggeration",
    stereotype: "Stereotype",
    generalization: "Generalization",
    false_equivalence: "False Equivalence"
  };

  function createEmptyCategoryCounts() {
    return {
      emotional_language: 0,
      exaggeration: 0,
      stereotype: 0,
      generalization: 0,
      false_equivalence: 0
    };
  }

  const CATEGORY_KEYS = Object.keys(createEmptyCategoryCounts());

  async function getSettings() {
    try {
      const result = await chrome.storage.sync.get("settings");
      return result.settings || {};
    } catch {
      return {};
    }
  }

  function isDomainWhitelisted(whitelist, hostname) {
    if (!whitelist || !whitelist.trim()) {
      return true;
    }
    const domains = whitelist.split("\n").map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) {
      return true;
    }
    const host = hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith("." + domain));
  }

  function getHighlightClassName(biasType) {
    return `bias-beacon-highlight--${biasType.replace(/_/g, "-")}`;
  }

  function getBiasLevel(biasScore) {
    const percentage = biasScore * 100;
    if (percentage <= 5) {
      return "Low bias";
    }
    if (percentage <= 15) {
      return "Moderate bias";
    }
    if (percentage <= 30) {
      return "High bias";
    }
    return "Extreme bias";
  }

  function isVisible(element) {
    const styles = window.getComputedStyle(element);
    return (
      styles.display !== "none" &&
      styles.visibility !== "hidden" &&
      styles.opacity !== "0" &&
      element.getClientRects().length > 0
    );
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeSentence(sentence) {
    return sentence.trim().replace(/\s+/g, " ");
  }

  function splitIntoSentences(text) {
    const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [];
  }

  function collectPageSentences() {
    const paragraphs = Array.from(document.querySelectorAll("p"));
    const paragraphData = [];
    const sentences = [];

    paragraphs.forEach((paragraph) => {
      if (!isVisible(paragraph)) {
        return;
      }

      const paragraphText = (
        paragraph.getAttribute(ORIGINAL_TEXT_ATTR) ?? paragraph.innerText
      ).trim();

      if (!paragraphText) {
        return;
      }

      if (!paragraph.hasAttribute(ORIGINAL_TEXT_ATTR)) {
        paragraph.setAttribute(ORIGINAL_TEXT_ATTR, paragraphText);
      }

      const paragraphSentences = splitIntoSentences(paragraphText);
      if (!paragraphSentences.length) {
        return;
      }

      paragraphData.push({
        element: paragraph,
        sentences: paragraphSentences
      });

      sentences.push(...paragraphSentences);
    });

    return {
      paragraphData,
      sentences
    };
  }

  function groupSentencesByNormalizedText(sentences) {
    const normalizedToIndices = new Map();
    const uniqueSentences = [];

    sentences.forEach((sentence, index) => {
      const normalized = normalizeSentence(sentence);
      if (!normalizedToIndices.has(normalized)) {
        normalizedToIndices.set(normalized, [index]);
        uniqueSentences.push(sentence);
      } else {
        normalizedToIndices.get(normalized).push(index);
      }
    });

    return { uniqueSentences, normalizedToIndices };
  }

  function buildParagraphMarkup(sentences, results, startIndex) {
    if (!sentences.length) {
      return { markup: "", flaggedCount: 0, categoryCounts: createEmptyCategoryCounts() };
    }

    let flaggedCount = 0;
    const categoryCounts = createEmptyCategoryCounts();
    const markedSentences = sentences.map((sentence, index) => {
      const escapedSentence = escapeHtml(sentence);
      const type = results[startIndex + index]?.bias_type;

      if (!type || (enabledCategories && !enabledCategories.includes(type))) {
        return escapedSentence;
      }

      flaggedCount += 1;
      if (Object.prototype.hasOwnProperty.call(categoryCounts, type)) {
        categoryCounts[type] += 1;
      }

      const highlightClass = getHighlightClassName(type);
      const tooltip = `${TOOLTIP_TEXT} Category: ${CATEGORY_LABELS[type]}.`;
      return `<span class="bias-beacon-highlight ${highlightClass}" title="${escapeHtml(tooltip)}">${escapedSentence}</span>`;
    });

    return {
      markup: markedSentences.join(" "),
      flaggedCount,
      categoryCounts
    };
  }

  function applyClassificationResults(paragraphData, results, enabledCategories) {
    let totalFlagged = 0;
    let resultIndex = 0;
    const categoryCounts = createEmptyCategoryCounts();

    paragraphData.forEach(({ element, sentences }) => {
      const { markup, flaggedCount, categoryCounts: paragraphCategoryCounts } = buildParagraphMarkup(
        sentences,
        results,
        resultIndex,
        enabledCategories
      );
      resultIndex += sentences.length;

      if (element.innerHTML !== markup) {
        element.innerHTML = markup;
      }

      totalFlagged += flaggedCount;
      CATEGORY_KEYS.forEach((category) => {
        categoryCounts[category] += paragraphCategoryCounts[category];
      });
    });

    return {
      count: totalFlagged,
      categoryCounts
    };
  }

  async function analyzePage() {
    const settings = await getSettings();

    // Apply highlight style to the document
    const highlightStyle = settings.highlightStyle || "highlight";
    document.documentElement.dataset.biasBeaconStyle = highlightStyle;

    // Determine enabled categories
    const enabledCategories = settings.categories
      ? CATEGORY_KEYS.filter((key) => settings.categories[key] !== false)
      : CATEGORY_KEYS;

    const { paragraphData, sentences } = collectPageSentences();
    if (!sentences.length) {
      return {
        count: 0,
        totalSentences: 0,
        biasScore: 0,
        biasLevel: "Low bias",
        categoryCounts: createEmptyCategoryCounts(),
        detailedResults: []
      };
    }

    const { uniqueSentences, normalizedToIndices } = groupSentencesByNormalizedText(sentences);
    const response = await chrome.runtime.sendMessage({
      type: "CLASSIFY_SENTENCES",
      sentences: uniqueSentences
    });

    const uniqueResults = Array.isArray(response?.results) ? response.results : [];
    const results = sentences.map(() => ({ biased: false, bias_type: null }));

    uniqueSentences.forEach((sentence, index) => {
      const normalized = normalizeSentence(sentence);
      const result = uniqueResults[index] ?? { biased: false, bias_type: null };
      const indices = normalizedToIndices.get(normalized) || [];
      indices.forEach((originalIndex) => {
        results[originalIndex] = result;
      });
    });

    const analysis = applyClassificationResults(paragraphData, results);
    const totalSentences = sentences.length;
    const biasScore = analysis.count / totalSentences;

    // Build detailed results for export
    const detailedResults = results
      .filter((r) => r.biased && enabledCategories.includes(r.bias_type))
      .map((r) => ({
        sentence: r.sentence,
        bias_type: r.bias_type
      }));

    const summary = {
      count: analysis.count,
      totalSentences,
      biasScore,
      biasLevel: getBiasLevel(biasScore),
      categoryCounts: analysis.categoryCounts,
      detailedResults
    };

    // Set badge count for auto-analyze visibility
    try {
      chrome.runtime.sendMessage({ type: "SET_BADGE", count: analysis.count });
    } catch {
      // Badge update is best-effort
    }

    return summary;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "ANALYZE_PAGE") {
      return;
    }

    Promise.resolve()
      .then(() => analyzePage())
      .then((summary) => {
        sendResponse(summary);
      })
      .catch((error) => {
        console.error("Bias Beacon content analysis failed:", error);
        const fallbackResponse = {
          count: 0,
          totalSentences: 0,
          biasScore: 0,
          biasLevel: "Low bias",
          categoryCounts: createEmptyCategoryCounts(),
          error: error.message
        };
        sendResponse(fallbackResponse);
      });

    return true;
  });

  // Auto-analyze on page load if enabled in settings
  (async function maybeAutoAnalyze() {
    if (window !== window.top) {
      return;
    }
    try {
      const settings = await getSettings();
      if (!settings.autoAnalyze) {
        return;
      }
      if (!isDomainWhitelisted(settings.domainWhitelist, window.location.hostname)) {
        return;
      }
      await analyzePage();
    } catch (error) {
      console.error("Bias Beacon auto-analyze failed:", error);
    }
  })();
}

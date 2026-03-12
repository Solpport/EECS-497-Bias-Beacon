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
        text: paragraphText,
        sentences: paragraphSentences
      });

      sentences.push(...paragraphSentences);
    });

    return {
      paragraphData,
      sentences
    };
  }

  function buildParagraphMarkup(paragraphText, sentenceResults) {
    const sentences = splitIntoSentences(paragraphText);
    if (!sentences.length) {
      return { markup: escapeHtml(paragraphText), flaggedCount: 0, categoryCounts: createEmptyCategoryCounts() };
    }

    let flaggedCount = 0;
    const categoryCounts = createEmptyCategoryCounts();
    const markedSentences = sentences.map((sentence, index) => {
      const escapedSentence = escapeHtml(sentence);
      const type = sentenceResults[index]?.bias_type;

      if (!type) {
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

  function applyClassificationResults(paragraphData, results) {
    let totalFlagged = 0;
    let resultIndex = 0;
    const categoryCounts = createEmptyCategoryCounts();

    paragraphData.forEach(({ element, text, sentences }) => {
      const sentenceResults = results.slice(resultIndex, resultIndex + sentences.length);
      resultIndex += sentences.length;

      const { markup, flaggedCount, categoryCounts: paragraphCategoryCounts } = buildParagraphMarkup(text, sentenceResults);
      element.innerHTML = markup;
      totalFlagged += flaggedCount;

      Object.keys(categoryCounts).forEach((category) => {
        categoryCounts[category] += paragraphCategoryCounts[category];
      });
    });

    return {
      count: totalFlagged,
      categoryCounts
    };
  }

  async function analyzePage() {
    const { paragraphData, sentences } = collectPageSentences();
    if (!sentences.length) {
      return {
        count: 0,
        totalSentences: 0,
        biasScore: 0,
        biasLevel: "Low bias",
        categoryCounts: createEmptyCategoryCounts()
      };
    }

    console.log("Sending sentences to background:", sentences.length);
    const response = await chrome.runtime.sendMessage({
      type: "CLASSIFY_SENTENCES",
      sentences
    });
    console.log("Sentences sent for classification:", sentences);

    const results = Array.isArray(response?.results) ? response.results : [];
    console.log("Results received from background:", results);
    const analysis = applyClassificationResults(paragraphData, results);
    const totalSentences = sentences.length;
    const biasScore = analysis.count / totalSentences;

    return {
      count: analysis.count,
      totalSentences,
      biasScore,
      biasLevel: getBiasLevel(biasScore),
      categoryCounts: analysis.categoryCounts
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "ANALYZE_PAGE") {
      return;
    }
    console.log("Received ANALYZE_PAGE message from popup");

    Promise.resolve()
      .then(() => analyzePage())
      .then((summary) => {
        console.log("Returning analysis summary:", summary);
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
        console.log("Returning analysis summary:", fallbackResponse);
        sendResponse(fallbackResponse);
      });

    return true;
  });
}

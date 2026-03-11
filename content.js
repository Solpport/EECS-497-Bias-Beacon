const ORIGINAL_TEXT_ATTR = "data-bias-beacon-original-text";

const CATEGORY_TOOLTIPS = {
  emotional:     "This sentence may contain emotionally loaded or manipulative language.",
  exaggeration:  "This sentence may contain exaggeration or hyperbole.",
  stereotype:    "This sentence may contain stereotyping or prejudice.",
  generalization:      "This sentence may contain a sweeping generalization.",
  "false-equivalence": "This sentence may contain a false equivalence.",
};

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
    return { markup: escapeHtml(paragraphText), flaggedCount: 0 };
  }

  let flaggedCount = 0;
  const markedSentences = sentences.map((sentence, index) => {
    const escapedSentence = escapeHtml(sentence);
    if (!sentenceResults[index]?.biased) {
      return escapedSentence;
    }

    flaggedCount += 1;
    const result = sentenceResults[index];
    const category = result.category ?? "emotional";
    const categoryLabel = CATEGORY_TOOLTIPS[category] ?? CATEGORY_TOOLTIPS.emotional;
    const tooltip = result.reason ? `${categoryLabel}\n\n${result.reason}` : categoryLabel;
    const escapedTooltip = escapeHtml(tooltip);
    return `<span class="bias-beacon-highlight bias-beacon-highlight--${category}" title="${escapedTooltip}">${escapedSentence}</span>`;
  });

  return {
    markup: markedSentences.join(" "),
    flaggedCount
  };
}

function applyClassificationResults(paragraphData, results) {
  let totalFlagged = 0;
  let resultIndex = 0;

  paragraphData.forEach(({ element, text, sentences }) => {
    const sentenceResults = results.slice(resultIndex, resultIndex + sentences.length);
    resultIndex += sentences.length;

    const { markup, flaggedCount } = buildParagraphMarkup(text, sentenceResults);
    element.innerHTML = markup;
    totalFlagged += flaggedCount;
  });

  return totalFlagged;
}

async function analyzePage() {
  const { paragraphData, sentences } = collectPageSentences();
  if (!sentences.length) {
    return 0;
  }

  const response = await chrome.runtime.sendMessage({
    type: "CLASSIFY_SENTENCES",
    sentences
  });

  const results = Array.isArray(response?.results) ? response.results : [];
  return applyClassificationResults(paragraphData, results);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ANALYZE_PAGE") {
    return;
  }

  const isTopFrame = window === window.top;

  analyzePage()
    .then((count) => {
      if (isTopFrame) sendResponse({ count });
    })
    .catch((error) => {
      console.error("Bias Beacon content analysis failed:", error);
      if (isTopFrame) sendResponse({ count: 0, error: error.message });
    });

  return true;
});

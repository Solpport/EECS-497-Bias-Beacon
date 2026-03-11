const ORIGINAL_TEXT_ATTR = "data-bias-beacon-original-text";
const TOOLTIP_TEXT = "This sentence may contain emotionally loaded or biased language.";

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
    return `<span class="bias-beacon-highlight" title="${TOOLTIP_TEXT}">${escapedSentence}</span>`;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ANALYZE_PAGE") {
    return;
  }

  analyzePage()
    .then((count) => {
      sendResponse({ count });
    })
    .catch((error) => {
      console.error("Bias Beacon content analysis failed:", error);
      sendResponse({ count: 0, error: error.message });
    });

  return true;
});

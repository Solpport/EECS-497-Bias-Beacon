importScripts("config.js");

// Dev auto-reload: polls watch.js server and reloads when files change.
// Remove this block (and the host_permission for localhost) before releasing.
(function devReload() {
  let lastVersion = null;
  async function poll() {
    try {
      const res = await fetch("http://127.0.0.1:9876");
      const version = await res.text();
      if (lastVersion === null) { lastVersion = version; return; }
      if (version !== lastVersion) chrome.runtime.reload();
    } catch {
      // watch.js not running — silently skip
    }
  }
  setInterval(poll, 1000);
})();

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const VALID_CATEGORIES = new Set(["emotional", "exaggeration", "stereotype", "generalization", "false-equivalence"]);

function buildPrompt(sentences) {
  return [
    "You are a language analysis tool.",
    "",
    "Identify which sentences contain biased or emotionally loaded language.",
    "For each biased sentence, assign exactly one category:",
    "  - emotional: emotionally charged or manipulative wording",
    "  - exaggeration: hyperbole or overstating facts",
    "  - stereotype: stereotyping or prejudice toward a group",
    "  - generalization: sweeping generalizations (e.g. 'everyone knows', 'they all')",
    "  - false-equivalence: comparing two unequal things as if they are equivalent",
    "",
    "Return ONLY a JSON array for biased sentences. If none are biased, return [].",
    "Each entry must include: index (1-based), category, and reason (one concise sentence explaining why).",
    "",
    'Example: [{ "index": 2, "category": "stereotype", "reason": "Generalizes behavior to an entire ethnic group." }, { "index": 7, "category": "emotional", "reason": "Uses alarming language to provoke fear." }]',
    "",
    "Sentences:",
    ...sentences.map((sentence, index) => `${index + 1}. ${sentence}`)
  ].join("\n");
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeResults(sentences, parsedResults) {
  const categoryMap = new Map();
  if (Array.isArray(parsedResults)) {
    parsedResults.forEach((r) => {
      if (typeof r?.index === "number" && VALID_CATEGORIES.has(r.category)) {
        categoryMap.set(r.index, { category: r.category, reason: r.reason ?? null });
      }
    });
  }
  return sentences.map((sentence, index) => {
    const entry = categoryMap.get(index + 1) ?? null;
    return { sentence, biased: entry !== null, category: entry?.category ?? null, reason: entry?.reason ?? null };
  });
}

async function classifySentences(sentences) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
    throw new Error("Set your OpenAI API key in config.js before running Bias Beacon.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You identify biased or emotionally loaded sentences and respond with a JSON array containing each sentence's 1-based index, bias category, and a brief reason."
        },
        {
          role: "user",
          content: buildPrompt(sentences)
        }
      ],
      temperature: 0
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const messageText = data?.choices?.[0]?.message?.content ?? "[]";
  const parsedResults = JSON.parse(stripCodeFences(messageText));
  return normalizeResults(sentences, parsedResults);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CLASSIFY_SENTENCES") {
    return;
  }

  classifySentences(Array.isArray(message.sentences) ? message.sentences : [])
    .then((results) => {
      sendResponse({ results });
    })
    .catch((error) => {
      console.error("Bias Beacon background classification failed:", error);
      sendResponse({ results: [], error: error.message });
    });

  return true;
});

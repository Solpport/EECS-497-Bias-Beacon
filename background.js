importScripts("config.js");

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

function buildPrompt(sentences) {
  return [
    "You are a language analysis tool.",
    "",
    "Determine whether each sentence contains emotionally loaded",
    "or biased language such as exaggeration, stereotyping,",
    "sweeping generalizations, or manipulative wording.",
    "",
    "Return ONLY JSON.",
    "",
    "Format:",
    "[",
    '  { "sentence": "...", "biased": true },',
    '  { "sentence": "...", "biased": false }',
    "]",
    "",
    "Sentences:",
    ...sentences.map((sentence, index) => `${index + 1}. ${sentence}`)
  ].join("\n");
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeResults(sentences, parsedResults) {
  return sentences.map((sentence, index) => {
    const result = Array.isArray(parsedResults) ? parsedResults[index] : null;
    return {
      sentence,
      biased: Boolean(result?.biased)
    };
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
          content: "You classify sentences for biased or emotionally loaded language and respond with JSON only."
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

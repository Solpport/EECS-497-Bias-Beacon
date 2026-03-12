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
    "Classify each sentence for biased or emotionally loaded language.",
    "Use these bias types when a sentence is biased:",
    "- emotional_language",
    "- exaggeration",
    "- stereotype",
    "- generalization",
    "- false_equivalence",
    "",
    "Return ONLY JSON.",
    "Return one object for every sentence in the same order as the input.",
    "If a sentence is not biased, set biased to false and bias_type to null.",
    "",
    "Format:",
    "[",
    '  { "sentence": "...", "biased": true, "bias_type": "stereotype" },',
    '  { "sentence": "...", "biased": false, "bias_type": null }',
    "]",
    "",
    "Sentences:",
    ...sentences.map((sentence, index) => `${index + 1}. ${sentence}`)
  ].join("\n");
}

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractJSONArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return text;
  }

  return text.slice(start, end + 1);
}

function tryRepairTruncatedArray(text) {
  const arrayText = extractJSONArray(text);
  if (!arrayText.trim().startsWith("[")) {
    return arrayText;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastSafeIndex = -1;

  for (let index = 0; index < arrayText.length; index += 1) {
    const char = arrayText[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        lastSafeIndex = index;
      }
    }
  }

  if (lastSafeIndex === -1) {
    return "[]";
  }

  return `${arrayText.slice(0, lastSafeIndex + 1)}]`;
}

function extractJSONObjectStrings(text) {
  const source = extractJSONArray(text);
  const objects = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let startIndex = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && startIndex !== -1) {
        objects.push(source.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return objects;
}

function parseClassificationResults(messageText) {
  const strippedText = stripCodeFences(messageText);

  try {
    return JSON.parse(strippedText);
  } catch (error) {
    console.warn("Initial classification JSON parse failed:", error);
  }

  const extractedArray = extractJSONArray(strippedText);
  try {
    return JSON.parse(extractedArray);
  } catch (error) {
    console.warn("Extracted classification JSON parse failed:", error);
  }

  const repairedArray = tryRepairTruncatedArray(strippedText);
  try {
    return JSON.parse(repairedArray);
  } catch (error) {
    console.warn("Repaired classification JSON parse failed:", error);
  }

  const objectStrings = extractJSONObjectStrings(strippedText);
  const recoveredResults = objectStrings.reduce((results, objectText) => {
    try {
      results.push(JSON.parse(objectText));
    } catch (error) {
      console.warn("Skipping malformed classification object:", error);
    }
    return results;
  }, []);

  console.warn("Recovered classification objects:", recoveredResults.length);
  return recoveredResults;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
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
    const result = Array.isArray(parsedResults) ? parsedResults[index] : null;
    const biasType = result?.bias_type || null;

    return {
      sentence,
      biased: Boolean(biasType),
      bias_type: biasType
    };
  });
}

async function classifyBatch(sentences) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
    throw new Error("Set your OpenAI API key in config.js before running Bias Beacon.");
  }

  console.log("Calling OpenAI for classification");
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
          content: "You classify sentences for bias categories and respond with JSON only."
        },
        {
          role: "user",
          content: buildPrompt(sentences)
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bias_classification",
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sentence: { type: "string" },
                    bias_type: {
                      type: "string",
                      enum: [
                        "emotional_language",
                        "exaggeration",
                        "stereotype",
                        "generalization",
                        "false_equivalence",
                        "none"
                      ]
                    }
                  },
                  required: ["sentence", "bias_type"],
                  additionalProperties: false
                }
              }
            },
            required: ["results"],
            additionalProperties: false
          }
        }
      },
      temperature: 0
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log("OPENAI RAW RESPONSE:", data);

  const parsedContainer =
    data?.output_parsed ??
    data?.choices?.[0]?.message?.parsed ??
    null;

  let parsedResults = parsedContainer?.results;

  if (!Array.isArray(parsedResults)) {
    const messageText = data?.choices?.[0]?.message?.content ?? "[]";
    const fallbackParsed = parseClassificationResults(messageText);
    parsedResults = Array.isArray(fallbackParsed?.results)
      ? fallbackParsed.results
      : fallbackParsed;
  }

  const normalizedParsedResults = (Array.isArray(parsedResults) ? parsedResults : []).map((result) => ({
    sentence: result?.sentence ?? "",
    bias_type: result?.bias_type === "none" ? null : result?.bias_type ?? null
  }));

  console.log("Parsed classification results:", normalizedParsedResults.length);
  return normalizeResults(sentences, normalizedParsedResults);
}

async function classifySentences(sentences) {
  const batches = chunkArray(sentences, 50);
  let allResults = [];

  console.log("Total sentences:", sentences.length);
  console.log("Processing batches:", batches.length);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    console.log(`Processing batch ${index + 1}/${batches.length}`);
    console.log("Batch size:", batch.length);

    let batchResults;

    try {
      batchResults = await classifyBatch(batch);
    } catch (error) {
      console.error(`Batch ${index + 1} failed, falling back to unbiased results:`, error);
      batchResults = normalizeResults(batch, []);
    }

    allResults = allResults.concat(batchResults);
  }

  console.log("Final results length:", allResults.length);
  return allResults;
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

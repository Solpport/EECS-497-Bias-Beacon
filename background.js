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
const CLASSIFICATION_BATCH_SIZE = 100;
const MAX_CONCURRENT_BATCHES = 6;
const SENTENCE_CACHE_KEY = "BIAS_BEACON_SENTENCE_CACHE";
const SENTENCE_CACHE_MAX_ENTRIES = 2000;
const SUPPORTED_BIAS_TYPES = new Set([
  "emotional_language",
  "exaggeration",
  "stereotype",
  "generalization",
  "false_equivalence",
  "none"
]);

const sentenceCache = new Map();
let cacheInitialized = false;
let cacheSaveTimer = null;

function normalizeSentence(sentence) {
  return sentence.trim().replace(/\s+/g, " ");
}

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
    "If a sentence is not biased, set biased to false and bias_type to none.",
    "",
    "Format:",
    "[",
    '  { "sentence": "...", "biased": true, "bias_type": "stereotype" },',
    '  { "sentence": "...", "biased": false, "bias_type": "none" }',
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

function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseClassificationResults(messageText) {
  const strippedText = stripCodeFences(messageText);
  const parsed = tryParseJSON(strippedText)
    || tryParseJSON(extractJSONArray(strippedText))
    || tryParseJSON(tryRepairTruncatedArray(strippedText));

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.results)) {
    return parsed.results;
  }

  const objectStrings = extractJSONObjectStrings(strippedText);
  return objectStrings.reduce((results, objectText) => {
    const item = tryParseJSON(objectText);
    if (item) {
      results.push(item);
    }
    return results;
  }, []);
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

function chunkArray(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

async function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local?.get) {
      resolve({});
      return;
    }
    chrome.storage.local.get(keys, resolve);
  });
}

async function chromeStorageSet(data) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local?.set) {
      resolve();
      return;
    }
    chrome.storage.local.set(data, resolve);
  });
}

async function loadSentenceCache() {
  if (cacheInitialized) {
    return;
  }

  cacheInitialized = true;

  try {
    const stored = await chromeStorageGet([SENTENCE_CACHE_KEY]);
    const raw = stored[SENTENCE_CACHE_KEY];
    if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          typeof value.bias_type === "string" &&
          typeof value.biased === "boolean"
        ) {
          sentenceCache.set(key, value);
        }
      });
    }
  } catch (error) {
    console.warn("Failed to load bias beacon cache:", error);
  }
}

function pruneCache() {
  while (sentenceCache.size > SENTENCE_CACHE_MAX_ENTRIES) {
    const oldestKey = sentenceCache.keys().next().value;
    sentenceCache.delete(oldestKey);
  }
}

async function saveSentenceCache() {
  if (!chrome?.storage?.local?.set) {
    return;
  }

  pruneCache();
  const payload = Object.fromEntries(sentenceCache);
  try {
    await chromeStorageSet({ [SENTENCE_CACHE_KEY]: payload });
  } catch (error) {
    console.warn("Failed to save bias beacon cache:", error);
  }
}

function scheduleCacheSave() {
  if (!chrome?.storage?.local?.set) {
    return;
  }

  if (cacheSaveTimer) {
    return;
  }

  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null;
    saveSentenceCache();
  }, 500);
}

function createNeutralResults(sentences) {
  return sentences.map(() => ({ biased: false, bias_type: null }));
}

function normalizeBiasType(value) {
  if (typeof value !== "string") {
    return "none";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "no bias" || normalized === "not biased") {
    return "none";
  }
  if (normalized === "emotional_language" || normalized === "emotional" || normalized === "emotional language") {
    return "emotional_language";
  }
  if (normalized === "exaggeration") {
    return "exaggeration";
  }
  if (normalized === "stereotype") {
    return "stereotype";
  }
  if (normalized === "generalization" || normalized === "generalisation") {
    return "generalization";
  }
  if (normalized === "false_equivalence" || normalized === "false equivalence" || normalized === "false-equivalence") {
    return "false_equivalence";
  }
  return "none";
}

function normalizeParsedResult(result) {
  const biasType = normalizeBiasType(result?.bias_type);
  return {
    sentence: typeof result?.sentence === "string" ? result.sentence : "",
    biased: biasType !== "none",
    bias_type: biasType === "none" ? null : biasType
  };
}

async function classifyBatch(sentences) {
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
          content: "You classify sentences for bias categories and respond with JSON only."
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
  let parsedResults = data?.output_parsed ?? data?.choices?.[0]?.message?.parsed ?? null;

  if (!Array.isArray(parsedResults)) {
    const messageText = data?.choices?.[0]?.message?.content ?? "";
    parsedResults = parseClassificationResults(messageText);
  }

  if (!Array.isArray(parsedResults)) {
    return createNeutralResults(sentences);
  }

  return parsedResults.map(normalizeParsedResult);
}

async function classifySentenceGroup(sentences) {
  const batches = chunkArray(sentences, CLASSIFICATION_BATCH_SIZE);
  if (!batches.length) {
    return [];
  }

  const batchResults = await mapWithConcurrency(
    batches,
    MAX_CONCURRENT_BATCHES,
    async (batch, index) => {
      try {
        return await classifyBatch(batch);
      } catch (error) {
        console.error(`Batch ${index + 1} failed, falling back to unbiased results:`, error);
        return createNeutralResults(batch);
      }
    }
  );

  return batchResults.flat();
}

async function classifySentences(sentences) {
  await loadSentenceCache();
  if (!sentences.length) {
    return [];
  }

  const results = new Array(sentences.length);
  const uncachedMap = new Map();

  sentences.forEach((sentence, index) => {
    const normalized = normalizeSentence(sentence);
    const cached = sentenceCache.get(normalized);
    if (cached) {
      results[index] = cached;
      return;
    }

    if (!uncachedMap.has(normalized)) {
      uncachedMap.set(normalized, { original: sentence, indices: [] });
    }
    uncachedMap.get(normalized).indices.push(index);
  });

  if (uncachedMap.size === 0) {
    return results;
  }

  const uniqueUncachedSentences = Array.from(uncachedMap.values()).map((entry) => entry.original);
  const normalizedKeys = Array.from(uncachedMap.keys());
  const uniqueResults = await classifySentenceGroup(uniqueUncachedSentences);

  uniqueResults.forEach((result, index) => {
    const normalized = normalizedKeys[index];
    const cachedResult = { biased: result.biased, bias_type: result.bias_type };
    sentenceCache.set(normalized, cachedResult);
    uncachedMap.get(normalized).indices.forEach((originalIndex) => {
      results[originalIndex] = cachedResult;
    });
  });

  scheduleCacheSave();
  return results;
}

async function mapWithConcurrency(items, concurrency, iterator) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await iterator(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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

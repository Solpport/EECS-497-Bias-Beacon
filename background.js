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
const CLASSIFICATION_BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 8;
const SENTENCE_CACHE_KEY = "BIAS_BEACON_SENTENCE_CACHE";
const SENTENCE_CACHE_MAX_ENTRIES = 2000;

const ALL_CATEGORIES = [
  "emotional_language",
  "exaggeration",
  "stereotype",
  "generalization",
  "false_equivalence"
];

const sentenceCache = new Map();
let cacheInitialized = false;
let cacheSaveTimer = null;

function normalizeSentence(sentence) {
  return sentence.trim().replace(/\s+/g, " ");
}

async function getSettings() {
  try {
    const result = await chrome.storage.sync.get("settings");
    return result.settings || {};
  } catch {
    return {};
  }
}

function getEnabledCategories(settings) {
  const cats = settings?.categories;
  if (!cats) return ALL_CATEGORIES;
  return ALL_CATEGORIES.filter((key) => cats[key] !== false);
}

function getSensitivityInstruction(sensitivity) {
  if (sensitivity === "low") {
    return "Only flag sentences with clear, obvious, and strong bias. Err on the side of NOT flagging.";
  }
  if (sensitivity === "high") {
    return "Flag any sentence that could potentially contain bias, even if subtle or implicit. Be thorough.";
  }
  return "Flag sentences that contain biased or emotionally loaded language.";
}

function buildPrompt(sentences, settings) {
  const sensitivity = settings?.sensitivity || "medium";
  const enabledCategories = getEnabledCategories(settings);

  return [
    "You are a language analysis tool.",
    "",
    getSensitivityInstruction(sensitivity),
    "Use ONLY these bias types when a sentence is biased:",
    ...enabledCategories.map((cat) => `- ${cat}`),
    "If a sentence is not biased, use \"none\".",
    "",
    "Return a JSON object with a \"types\" array — one entry per sentence, in the same order as the input.",
    "",
    "Sentences:",
    ...sentences.map((sentence, index) => `${index + 1}. ${sentence}`)
  ].join("\n");
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
  if (cacheInitialized) return;
  cacheInitialized = true;

  try {
    const stored = await chromeStorageGet([SENTENCE_CACHE_KEY]);
    const raw = stored[SENTENCE_CACHE_KEY];
    if (raw && typeof raw === "object") {
      Object.entries(raw).forEach(([key, value]) => {
        if (value && typeof value === "object" && typeof value.bias_type !== "undefined") {
          sentenceCache.set(key, {
            biased: Boolean(value.biased),
            bias_type: value.bias_type || null
          });
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
  if (!chrome?.storage?.local?.set) return;
  pruneCache();
  const payload = Object.fromEntries(sentenceCache);
  try {
    await chromeStorageSet({ [SENTENCE_CACHE_KEY]: payload });
  } catch (error) {
    console.warn("Failed to save bias beacon cache:", error);
  }
}

function scheduleCacheSave() {
  if (cacheSaveTimer) return;
  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null;
    saveSentenceCache();
  }, 500);
}

function normalizeBiasType(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "no bias" || v === "not biased" || v === "") return null;
  if (v === "emotional" || v === "emotional language" || v === "emotional_language") return "emotional_language";
  if (v === "exaggeration") return "exaggeration";
  if (v === "stereotype") return "stereotype";
  if (v === "generalization" || v === "generalisation") return "generalization";
  if (v === "false equivalence" || v === "false-equivalence" || v === "false_equivalence") return "false_equivalence";
  return null;
}

function neutralResults(sentences) {
  return sentences.map(() => ({ biased: false, bias_type: null }));
}

async function classifyBatch(sentences, settings) {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey || apiKey === "YOUR_OPENAI_API_KEY") {
    throw new Error("Set OPENAI_API_KEY in config.js before running Bias Beacon.");
  }

  const enabledCategories = getEnabledCategories(settings);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You classify sentences for bias categories and respond with a single JSON object only."
        },
        {
          role: "user",
          content: buildPrompt(sentences, settings)
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bias_types",
          strict: true,
          schema: {
            type: "object",
            properties: {
              types: {
                type: "array",
                items: {
                  type: "string",
                  enum: [...enabledCategories, "none"]
                }
              }
            },
            required: ["types"],
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
  const content = data?.choices?.[0]?.message?.content ?? "{}";

  let types = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.types)) types = parsed.types;
  } catch (error) {
    console.warn("Failed to parse classification response:", error);
  }

  // Positional: align to input length; pad with nulls if short, truncate if long.
  return sentences.map((_, index) => {
    const biasType = normalizeBiasType(types[index]);
    return { biased: biasType !== null, bias_type: biasType };
  });
}

async function mapWithConcurrency(items, concurrency, iterator) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await iterator(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function classifyUnique(sentences, settings) {
  const batches = chunkArray(sentences, CLASSIFICATION_BATCH_SIZE);
  if (!batches.length) return [];

  const batchResults = await mapWithConcurrency(
    batches,
    MAX_CONCURRENT_BATCHES,
    async (batch, index) => {
      try {
        return await classifyBatch(batch, settings);
      } catch (error) {
        console.error(`Batch ${index + 1} failed:`, error);
        return neutralResults(batch);
      }
    }
  );

  return batchResults.flat();
}

async function classifySentences(sentences, settings) {
  await loadSentenceCache();
  if (!sentences.length) return [];

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

  if (uncachedMap.size === 0) return results;

  const uniqueSentences = Array.from(uncachedMap.values()).map((e) => e.original);
  const normalizedKeys = Array.from(uncachedMap.keys());
  const uniqueResults = await classifyUnique(uniqueSentences, settings);

  uniqueResults.forEach((result, index) => {
    const normalized = normalizedKeys[index];
    sentenceCache.set(normalized, result);
    uncachedMap.get(normalized).indices.forEach((originalIndex) => {
      results[originalIndex] = result;
    });
  });

  scheduleCacheSave();
  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SET_BADGE" && sender.tab) {
    const text = message.count > 0 ? String(message.count) : "";
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#1d4ed8", tabId: sender.tab.id });
    return;
  }

  if (message?.type !== "CLASSIFY_SENTENCES") return;

  getSettings()
    .then((settings) =>
      classifySentences(
        Array.isArray(message.sentences) ? message.sentences : [],
        settings
      )
    )
    .then((results) => sendResponse({ results }))
    .catch((error) => {
      console.error("Bias Beacon background classification failed:", error);
      sendResponse({ results: [], error: error.message });
    });

  return true;
});

// Clear per-tab badge when the user navigates away.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

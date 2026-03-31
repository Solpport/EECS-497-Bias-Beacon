# EECS 497 — Testing and Debugging Report
## Bias Beacon

---

# Part 1: Sample Test Suite

---

### Test 1: Sentence Splitting Accuracy

**Type:** Unit

**Description:**
Tests the `splitIntoSentences` function in `content.js` to verify it correctly splits paragraph text into individual sentences. Inputs include standard multi-sentence paragraphs, text with abbreviations (Dr., U.S., D.C., Mr., Mrs.), text with ellipses ("Wait... what?"), single-sentence paragraphs, and empty strings. This test targets the core text-parsing logic that all downstream analysis depends on.

**Results that dictate success:**
- "Dr. Smith traveled to D.C. for a meeting." returns 1 sentence, not 3+
- "This is biased. This is not." returns exactly 2 sentences
- An empty string returns an empty array
- A sentence with no terminal punctuation is still captured

**Test assigned to:** TBD

---

### Test 2: Settings Persistence and Loading

**Type:** Integration

**Description:**
Tests that settings saved via the settings page (`settings.js`) are correctly persisted to `chrome.storage.sync` and correctly loaded on subsequent page opens. Covers all setting types: API key (string), sensitivity (enum), category toggles (booleans), highlight style (enum), auto-analyze (boolean), and domain whitelist (multiline string). Also tests that the "Reset to Defaults" button restores all fields to their default values.

**Results that dictate success:**
- After saving, `chrome.storage.sync.get("settings")` returns an object matching all form values
- After closing and reopening the settings page, all form fields reflect the saved values
- After clicking "Reset to Defaults," all fields match `DEFAULT_SETTINGS` and storage is updated
- Sensitivity slider label text matches the slider position (Low/Medium/High)

**Test assigned to:** TBD

---

### Test 3: Category Toggle Validation

**Type:** Unit, Validation

**Description:**
Tests that the settings page prevents the user from disabling all five bias categories simultaneously. If all checkboxes are unchecked and the user clicks "Save Settings," an error message should appear and the settings should NOT be saved. Also tests that saving with at least one category checked succeeds. This validation exists because the OpenAI API schema requires a non-empty `enum` array; an empty array would cause a 400 error.

**Results that dictate success:**
- Unchecking all 5 categories and clicking Save shows "Enable at least one bias category." error
- Settings in `chrome.storage.sync` remain unchanged after the failed save
- Checking any single category and saving succeeds with "Settings saved!" confirmation
- The error message auto-clears after 3 seconds

**Test assigned to:** TBD

---

### Test 4: API Key Validation and Masking

**Type:** UI/UX, Validation

**Description:**
Tests the API key input field on the settings page. Verifies that the input defaults to `type="password"` (masked), the Show/Hide toggle switches between masked and plaintext, the status indicator shows appropriate messages for empty keys, valid-format keys (starting with "sk-"), and invalid-format keys. Also tests that leading/trailing whitespace is trimmed before saving.

**Results that dictate success:**
- Input field type is "password" on initial load
- Clicking "Show" changes type to "text" and button label to "Hide"
- Empty key shows warning: "No API key set. Will use default key if available."
- Key starting with "sk-" shows green: "API key is set."
- Key not starting with "sk-" shows red: "API key format looks incorrect"
- A key entered as "  sk-abc123  " is saved as "sk-abc123" (trimmed)

**Test assigned to:** TBD

---

### Test 5: Sensitivity Level Affects Classification

**Type:** Integration, Validation

**Description:**
Tests that changing the sensitivity setting (Low/Medium/High) in settings produces different classification behavior from the LLM. Uses a fixed set of 10 sentences with varying degrees of bias — some clearly biased, some borderline, some neutral. Runs the classification at each sensitivity level and compares the number of flagged sentences. The LLM prompt is modified per sensitivity level, so results should differ.

**Results that dictate success:**
- Low sensitivity flags fewer sentences than Medium
- Medium sensitivity flags fewer sentences than High
- At least one clearly biased sentence (e.g., "All politicians are corrupt liars") is flagged at all levels
- At least one neutral sentence (e.g., "The meeting was held on Tuesday.") is NOT flagged at any level
- The prompt sent to OpenAI contains the correct sensitivity instruction for each level

**Test assigned to:** TBD

---

### Test 6: Highlight Styles Render Correctly

**Type:** UI/UX

**Description:**
Tests that all three highlight styles (Highlight, Underline, Border) render correctly on analyzed text. After running analysis on a page with known biased content, switch between highlight styles in settings and re-analyze. Verifies that the correct CSS is applied for each style and that all five bias category colors are visually distinct under each style.

**Results that dictate success:**
- "highlight" style: biased sentences have colored background (e.g., `background-color: #fff176` for emotional)
- "underline" style: biased sentences have wavy underline, transparent background
- "border" style: biased sentences have bottom border, transparent background
- The `data-bias-beacon-style` attribute on `<html>` matches the selected style
- All 5 category colors are distinguishable under each style

**Test assigned to:** TBD

---

### Test 7: Domain Whitelist Filtering

**Type:** Unit, System

**Description:**
Tests the `isDomainWhitelisted` function in `content.js` and its integration with the auto-analyze feature. Verifies that when a whitelist is configured, auto-analyze only runs on matching domains. Tests exact domain matches, subdomain matching (e.g., "cnn.com" matches "www.cnn.com"), empty whitelist (should allow all), and non-matching domains. Also tests that the whitelist is parsed correctly when it contains blank lines or extra whitespace.

**Results that dictate success:**
- Whitelist "cnn.com" matches hostname "cnn.com" (exact match)
- Whitelist "cnn.com" matches hostname "www.cnn.com" (subdomain)
- Whitelist "cnn.com" does NOT match hostname "fakecnn.com" (not a subdomain)
- Empty whitelist allows all domains (returns true)
- Whitelist with blank lines and extra spaces is parsed correctly, ignoring empties
- Auto-analyze triggers on whitelisted domains and does NOT trigger on non-whitelisted domains

**Test assigned to:** TBD

---

### Test 8: Export JSON Format Correctness

**Type:** Unit, Validation

**Description:**
Tests that the JSON export from the popup produces a valid, correctly structured JSON file after analysis. Runs analysis on a page with known biased content, clicks "Export JSON," and validates the downloaded file. Checks that the JSON is parseable, contains the expected fields (`sentence`, `bias_type`), and that the `bias_type` values are valid category strings.

**Results that dictate success:**
- Downloaded file is valid JSON (parses without error)
- Each object in the array has `sentence` (non-empty string) and `bias_type` (valid category string)
- The number of objects matches the biased sentence count shown in the popup
- `bias_type` values are exclusively from the set: emotional_language, exaggeration, stereotype, generalization, false_equivalence
- File is named "bias-beacon-results.json"

**Test assigned to:** TBD

---

### Test 9: Popup Displays Correct Summary After Analysis

**Type:** Integration, UI/UX

**Description:**
Tests that after clicking "Analyze Page," the popup correctly displays all summary information: biased sentence count, total sentence count, per-category counts, bias score percentage, bias level label, and progress bar width/color. Uses a page with known content to verify that the counts are accurate and the bias level thresholds are applied correctly (Low <= 5%, Moderate <= 15%, High <= 30%, Extreme > 30%).

**Results that dictate success:**
- Biased count matches the number of highlighted sentences on the page
- Total count matches the total number of sentences collected from `<p>` elements
- Per-category counts sum to the total biased count
- Bias score percentage equals `Math.round((biased / total) * 100)`
- Bias level label and progress bar color match the percentage thresholds
- The "Analyzing page..." text is replaced with the result text after completion

**Test assigned to:** TBD

---

### Test 10: Analysis on Chrome Internal Pages

**Type:** System, Validation

**Description:**
Tests that the extension gracefully handles pages it cannot analyze: `chrome://` pages, `chrome-extension://` pages, `edge://` pages, and `about:blank`. The popup should display a clear error message instead of attempting to inject the content script (which would fail and throw). Also tests that the analyze button is re-enabled after the error so the user can navigate to a valid page and try again.

**Results that dictate success:**
- On `chrome://extensions`, popup shows "Cannot analyze Chrome internal pages."
- On `about:blank`, popup shows "Cannot analyze Chrome internal pages."
- The analyze button is NOT left in a disabled state after the error
- No errors appear in the service worker console
- The extension does not attempt to inject content scripts into these pages

**Test assigned to:** TBD

---

# Part 2: Bug Reports

---

### Bug 1: "Dr. Splitenstein" — Sentence Splitter Breaks on Abbreviations

**Associated Test:** Test 1 (Sentence Splitting Accuracy)

**Description:**
The `splitIntoSentences` function in `content.js` uses the regex `/[^.!?]+[.!?]+|[^.!?]+$/g` to split text into sentences. This splits on every period, including those in abbreviations. The text "Dr. Smith traveled to Washington D.C. for a meeting." is split into `["Dr.", " Smith traveled to Washington D.", "C.", " for a meeting."]` instead of one sentence. This causes the LLM to receive meaningless fragments, leading to incorrect bias classifications and garbled highlights. Found by running Test 1 with abbreviation-containing inputs.

**Bug Status:**
Unresolved. Plan: Replace the naive regex with a lookahead-based approach like `/(?<=[.!?])\s+(?=[A-Z])/` that splits only when punctuation is followed by whitespace and a capital letter, or maintain an abbreviation whitelist to skip known patterns.

**Bug assigned to:** TBD

---

### Bug 2: "The Ghost Variable" — Dead Code References Undefined VALID_CATEGORIES

**Associated Test:** Found during code review (not from a specific test)

**Description:**
In `background.js`, the `normalizeResults` function contains a block referencing `VALID_CATEGORIES.has(r.category)`. This constant was removed during refactoring and replaced with `ALL_CATEGORIES`. The code does not currently crash because short-circuit evaluation prevents the undefined variable from being accessed — the preceding condition `typeof r?.index === "number"` is always false since results use positional indexing. However, the `categoryMap` it builds is never used. Found during manual code review of the classification pipeline.

**Bug Status:**
Unresolved. Plan: Remove the dead `categoryMap` block entirely (lines 236–243 of `background.js`). The positional lookup below it is the correct and active logic path.

**Bug assigned to:** TBD

---

### Bug 3: "Newline Nightmare" — CSV Export Breaks on Multi-Line Sentences

**Associated Test:** Test 8 (Export JSON Format Correctness) — adapted for CSV

**Description:**
In `popup.js`, the CSV export escapes double quotes within sentences but does not handle newline characters. If a sentence scraped from the page contains a `\n` (e.g., from a `<p>` tag with a `<br>` inside), the newline appears as a literal line break in the CSV, breaking row structure. All subsequent rows shift, making the file unparseable in spreadsheet applications. Found by running the export test on a page whose paragraphs contained `<br>` tags.

**Bug Status:**
Unresolved. Plan: Strip newlines within each sentence before writing to CSV: `r.sentence.replace(/"/g, '""').replace(/[\r\n]+/g, " ")`.

**Bug assigned to:** TBD

---

### Bug 4: "The Stubborn Highlighter" — Style Change Requires Re-Analysis

**Associated Test:** Test 6 (Highlight Styles Render Correctly)

**Description:**
The `data-bias-beacon-style` attribute that controls highlight rendering (background, underline, or border) is only set inside `analyzePage()`. If a user changes the highlight style in settings, existing highlights on the current page keep the old style. The user must re-analyze (making another API call) just to change a visual setting. Found during Test 6 when switching styles between analyses — the old background-color highlights persisted until a fresh analysis was triggered.

**Bug Status:**
Unresolved. Plan: Add a `chrome.storage.onChanged` listener in `content.js` that updates `document.documentElement.dataset.biasBeaconStyle` immediately when the highlight style setting changes, without requiring re-analysis.

**Bug assigned to:** TBD

---

### Bug 5: "Badge of Dishonor" — Stale Badge Count After Navigation

**Associated Test:** Found during manual testing of auto-analyze feature

**Description:**
When auto-analyze runs and sets the extension badge to a count (e.g., "12"), navigating to a different page leaves the old badge visible. The badge only updates when a new analysis completes. If the new page is not on the domain whitelist or auto-analyze is disabled, the badge shows a stale count from the previous page. Found during manual testing: enabled auto-analyze on cnn.com, saw badge "8", navigated to google.com, badge still showed "8".

**Bug Status:**
Unresolved. Plan: Add a `chrome.tabs.onUpdated` listener in `background.js` that clears the badge text when a tab's URL changes (status === "loading").

**Bug assigned to:** TBD

---

### Bug 6: "No News is No Report" — Export Hidden When Zero Bias Found

**Associated Test:** Test 8 (Export JSON Format Correctness)

**Description:**
In `popup.js`, the export section only appears when `response?.detailedResults?.length` is truthy, meaning the buttons stay hidden when analysis finds zero biased sentences. Users cannot export a "clean report" proving a page has no bias — a valid use case for journalism students or content reviewers. Found when running Test 8 against a neutral Wikipedia article: the analysis completed successfully (showing "0 biased sentences detected") but the export buttons never appeared.

**Bug Status:**
Unresolved. Plan: Change the condition from `response?.detailedResults?.length` to `response?.totalSentences > 0` so export buttons appear after any successful analysis regardless of bias count.

**Bug assigned to:** TBD

---

### Bug 7: "Double Trouble" — Concurrent Analyses via Popup Reopen

**Associated Test:** Test 9 (Popup Displays Correct Summary After Analysis)

**Description:**
The `analysisRunning` flag lives in `popup.js` state, which resets when the popup closes and reopens. If a user clicks "Analyze," closes the popup (analysis continues in the content script), reopens the popup and clicks "Analyze" again, two concurrent `analyzePage()` calls run against the same page. Both modify `innerHTML` of the same paragraph elements simultaneously, causing garbled highlights, incorrect counts, and doubled API charges. Found during Test 9 when rapidly reopening the popup during a long analysis on a large article.

**Bug Status:**
Unresolved. Plan: Add a module-scoped `let analysisRunning = false` guard in `content.js` itself, so the content script rejects concurrent `ANALYZE_PAGE` messages regardless of popup state.

**Bug assigned to:** TBD

---

### Bug 8: "Link Graveyard" — innerHTML Replacement Destroys Page Interactivity

**Associated Test:** Found during manual testing on news sites

**Description:**
In `content.js`, `element.innerHTML = markup` replaces the entire inner HTML of each `<p>` element. This destroys event listeners, `<a>` link handlers, embedded buttons, images, and any other interactive content inside paragraphs. On modern news sites, paragraphs frequently contain inline links, embedded social widgets, or interactive footnotes. After analysis, these become non-functional plain text. Found during manual testing on a New York Times article: all inline article links within paragraphs became dead after analysis.

**Bug Status:**
Unresolved. Plan: Replace the `innerHTML` approach with a DOM-based method using `TreeWalker` to find text nodes and `Range.surroundContents()` to wrap biased sentences in `<span>` elements. This preserves existing child elements and their event listeners.

**Bug assigned to:** TBD

---

### Bug 9: "Fashionably Late Content" — Auto-Analyze Misses Dynamic Content

**Associated Test:** Test 7 (Domain Whitelist Filtering) — observed during system testing

**Description:**
`collectPageSentences()` queries `document.querySelectorAll("p")` at analysis time. When auto-analyze fires at `document_idle`, it only captures paragraphs in the initial DOM. Dynamically loaded content — infinite-scroll articles, AJAX comment sections, lazy-loaded content — is never analyzed. This is particularly noticeable on CNN, where comment sections render after the initial page load. Found during domain whitelist system testing: auto-analyze correctly triggered on cnn.com but only highlighted the article body, missing all comment content loaded seconds later.

**Bug Status:**
Unresolved. Plan: Add a debounced `MutationObserver` that watches for new `<p>` elements after initial analysis and queues them for incremental classification. Only active when auto-analyze is enabled.

**Bug assigned to:** TBD

---

### Bug 10: "Key to the Cloud" — API Key Stored in Plaintext via Sync Storage

**Associated Test:** Test 2 (Settings Persistence and Loading) — security observation

**Description:**
When the user saves their OpenAI API key, `settings.js` stores it in `chrome.storage.sync` as a plaintext string. This storage mechanism syncs data across all Chrome instances via Google's servers, meaning the API key is transmitted to and stored on Google's infrastructure in cleartext. On shared or managed Chrome profiles, this is a security risk. If a user's Google account is compromised, their API key is exposed. Found during Test 2 when inspecting `chrome.storage.sync` contents after saving settings — the full key was visible in plaintext.

**Bug Status:**
Unresolved. Plan: Switch API key storage from `chrome.storage.sync` to `chrome.storage.local` (device-only, no cloud sync). For additional security, consider encrypting the key with the Web Crypto API before storage.

**Bug assigned to:** TBD

---

# Part 3: Testing and Debugging Summary

Our test suite was designed to cover the full surface area of Bias Beacon across multiple testing levels. We prioritized diversity by including unit tests for isolated logic (sentence splitting, domain matching, export formatting), integration tests for cross-component data flow (settings affecting classification behavior, popup reflecting content script results), validation tests for input boundaries (category toggle constraints, API key format, internal page detection), UI/UX tests for visual correctness (highlight styles, popup summary display), and system-level tests for real-world behavior (auto-analyze on live sites, badge persistence).

The tests were selected to target the areas with the highest risk of user-facing defects. The sentence splitter (Test 1) is the foundation of all analysis — if it misparses text, every downstream result is wrong. Settings persistence (Tests 2–4) is critical because the new settings page introduces a large state surface that must survive across sessions. The sensitivity and category tests (Tests 5, 3) verify that user preferences actually change LLM behavior rather than being cosmetic. Export (Test 8) and popup display (Test 9) ensure the user can trust and use the results they see. The Chrome internal pages test (Test 10) prevents confusing errors on pages the extension cannot analyze.

Of the 10 bugs identified, most remain unresolved. Our immediate priorities are Bug 1 (sentence splitting) and Bug 8 (innerHTML destruction), as these directly degrade analysis accuracy and break host page functionality respectively. Bug 7 (race condition) and Bug 10 (API key security) are next, as they affect reliability and user security. The remaining bugs (badge persistence, export edge cases, style updates, dynamic content) are lower severity and planned for the final development sprint.

Before project completion, we plan to run the full test suite on at least three distinct websites (a news article, a social media page, and a blog post) to validate real-world behavior. We also plan to add automated regression tests for the sentence splitter and domain whitelist functions, as these are pure functions that are easy to test in isolation. Finally, we will conduct a manual security review of all stored data to ensure no sensitive information is transmitted unnecessarily.

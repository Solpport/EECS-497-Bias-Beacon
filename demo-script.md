# Bias Beacon — Final Project Demo Script

**Target length:** ~10–12 minutes
**Format:** Screen recording with voiceover

---

## 0. Pre-Recording Checklist

- [ ] Load extension unpacked from `chrome://extensions` with a valid API key configured in Settings
- [ ] Clear badge and previous analysis state
- [ ] Open the four demo tabs in order (see Section 4)
- [ ] Set zoom to 110% for readability on screen
- [ ] Close unrelated tabs and disable other extensions that might interfere
- [ ] Silence notifications

---

## 1. Opening / Introduction (≈1 min)

> "Hi, we're the Bias Beacon team for EECS 497. Our project is a Chrome extension that highlights potentially biased or emotionally loaded language on any webpage using a large language model. In the next ten minutes we'll walk through who this tool is for, show you every feature in action on four very different websites, talk through the technical architecture, and share the biggest challenges we hit along the way."

**Show:** Extension icon in the toolbar, popup opened to the main view.

---

## 2. The Problem and Our Primary Persona (≈1 min)

> "Our primary persona is a college student taking a political science or journalism course. They read news across the political spectrum for class and want to quickly spot when an article is leaning on loaded language rather than facts. Reading critically is a learned skill — Bias Beacon is a second pair of eyes that makes the patterns visible while the student builds that intuition."

**Secondary users:** journalists auditing their own drafts, researchers, fact-checking hobbyists.

**Key pain point addressed:** a student can consume dozens of articles a week. Manually annotating emotional language is tedious; an automated first pass lets them focus their critical reading on the sentences that matter.

---

## 3. Feature Walkthrough in the Popup (≈1.5 min)

Walk through the popup UI without running analysis yet.

1. **"Analyze Page" button** — single click to scan the active tab.
2. **Bias summary panel** — total sentences, biased sentences, per-category counts, overall bias level (Low / Moderate / High / Extreme), and a bias score progress bar.
3. **Color legend** — five categories: Emotional Language (yellow), Exaggeration (orange), Stereotype (red), Generalization (purple), False Equivalence (teal).
4. **Settings (gear icon)** — open and demonstrate:
   - API key field (paste your own OpenAI key; status indicator validates format)
   - Sensitivity slider (Low / Medium / High — tunes the LLM's flagging threshold)
   - Category toggles (disable categories you don't want flagged)
   - Highlight style (background color, wavy underline, or bottom border)
   - Auto-analyze on page load + domain whitelist
   - Save / Reset buttons

> "Everything persists via `chrome.storage.sync`, so your settings follow your Chrome profile."

5. **Export buttons** — JSON and CSV export of flagged sentences appear after analysis completes.

---

## 4. Live Demo on Four Diverse Websites (≈4.5 min)

We chose four sites representing a spectrum from wire-service neutrality to opinion writing to user-generated comments. This demonstrates that the tool works on different content styles and surfaces different *types* of bias on each.

> **Important:** verify every URL the morning of the recording. News sites reorganize constantly, articles move behind paywalls, and live-update pages change content between visits. Backups are listed in Appendix B.

### 4a. NPR — Iran / Strait of Hormuz coverage (≈1 min) — **baseline / low bias**

**URL:** https://www.npr.org/2026/04/18/nx-s1-5789780/iran-middle-east-updates

> "First, let's run it on an NPR news article about the ongoing Strait of Hormuz situation. NPR is rated center-to-lean-left on AllSides but their hard-news reporting is factual and avoids loaded language. We expect Bias Beacon to find very little here."

- Click **Analyze Page**.
- **Expected result:** low bias score (under ~5%), bar stays green, only a handful of highlights (if any).
- **Talking point:** "This is our control. When the tool finds nothing, it's behaving correctly — the article is mostly factual reporting. If our tool over-flagged on straight news, students would learn to ignore it."

### 4b. Fox News opinion — "MAHA gives Republicans a real midterm edge" (≈1 min) — **right-leaning opinion**

**URL:** https://www.foxnews.com/opinion/mary-katharine-ham-republicans-huge-maha-opportunity-2026-dont-blow

> "Next, a Fox News opinion column by Mary Katharine Ham about the 2026 midterms. Opinion is where loaded language lives, regardless of political lean."

- Click **Analyze Page**.
- **Expected result:** moderate-to-high bias score, mix of Emotional Language and Exaggeration, likely some Generalization about political groups.
- **Hover over a highlighted sentence** to show the category tooltip.
- **Talking point:** "Notice the tool flagged specific phrases rather than the whole article. A student can now focus their critical reading on exactly those sentences instead of re-reading everything."

### 4c. The Guardian — Marina Hyde column (≈1 min) — **left-leaning opinion**

**URL:** https://www.theguardian.com/commentisfree/2026/mar/10/shock-awe-trump-granddaughter-kai-war-effort-shopper

> "To show the tool isn't one-sided, here's a Marina Hyde column from the Guardian's Comment is Free section. Marina Hyde is a satirist — her columns lean heavily on rhetorical devices, so we expect plenty of flags."

- Click **Analyze Page**.
- **Expected result:** comparable bias score to the Fox piece, with heavier emphasis on Emotional Language and Exaggeration (satirical writing).
- **Talking point:** "Same tool, same thresholds, applied symmetrically. The bias score on a satirical column should be similar to a right-leaning op-ed, and it is. Our sensitivity slider and category toggles are the user's primary levers."

### 4d. Reddit r/politics — top post of the week (≈1.5 min) — **user-generated content**

**URL (live):** https://www.reddit.com/r/politics/top/?t=week — pick the top post at time of recording

> "Finally, let's try user comments on Reddit, where emotional and stereotyping language tends to be densest."

- Scroll through the post body plus at least the first 10–20 comments so there's enough text.
- Click **Analyze Page**.
- **Expected result:** high bias score; heavy presence of Stereotype and Emotional Language; usually a handful of False Equivalence flags.
- **Click the CSV export button** and open the downloaded file to prove the export works.
- **Talking point:** "User-generated content is a different beast from journalism. Our tool handles both because it works at the sentence level, not the whole-article level — even a mix of neutral and hostile comments on the same page gets sorted correctly."

---

## 5. Technical Architecture (≈1.5 min)

Walk through the high-level design without line-by-line code.

1. **Manifest V3 Chrome extension** — `content.js` runs in the page, `background.js` is the service worker, `popup.html` is the user-facing UI.
2. **Analysis pipeline:**
   - Content script walks visible `<p>` elements, splits them into sentences.
   - Sentences are batched (50 per batch, up to 3 batches concurrently) and sent to the background service worker.
   - Background calls OpenAI's `gpt-4o-mini` with a JSON-schema-constrained response format, so the model's output is a structured array of `{ sentence, bias_type }` objects — no JSON-parsing fragility.
   - Content script maps results back to sentences and wraps flagged spans with category-specific CSS classes.
3. **Why GPT-4o-mini:** we tested against a rule-based keyword approach and the LLM catches implicit bias the keyword list misses (sweeping generalizations, dog-whistle framing) while being cheap enough to run on every paragraph.
4. **Why Chrome extension vs. a web app:** bias detection is most useful in-context, on the page the user is already reading. Asking them to copy-paste into a separate tool breaks their reading flow.
5. **Settings architecture:** the settings page writes to `chrome.storage.sync`. Both content and background scripts read from storage on each analysis, so changes take effect on the very next run without needing to reload the extension.

---

## 6. Challenges and How We Resolved Them (≈1.5 min)

Pick three concrete challenges to talk about:

1. **Analysis used to take ~60 seconds per page.**
   - *Cause:* our first prompt echoed every sentence back in the response, so output tokens scaled linearly with page length.
   - *Fix:* restructured the output to an index-and-category-only JSON schema, then added batching with bounded concurrency. Typical pages now analyze in 3–5 seconds.

2. **"Could not establish connection" errors on pre-existing tabs.**
   - *Cause:* Chrome only injects content scripts on page load; tabs already open when the extension was reloaded had no listener.
   - *Fix:* the popup catches this specific error and programmatically injects `content.js` via `chrome.scripting.executeScript`, then retries.

3. **Highlights were flickering in iframes and returning wrong counts.**
   - *Cause:* with `all_frames: true`, every frame responded to the `ANALYZE_PAGE` message, and the popup received whichever frame finished first — often a tiny ad frame with zero sentences.
   - *Fix:* only the top-level frame calls `sendResponse`; iframes still highlight themselves but stay silent.

Optionally mention: the balance between `chrome.storage.sync` for cross-device settings vs. security concerns around syncing an API key.

---

## 7. Closing (≈30 sec)

> "That's Bias Beacon. It's a working Chrome extension, not a prototype — you can load it unpacked today, configure your own OpenAI key, and use it on any article or comment thread. Thanks for watching."

**Show:** extension icon, settings page once more, then fade out.

---

## Appendix A — Shot List for Recording

| # | Screen | Narration cue |
|---|---|---|
| 1 | Extension popup closed, toolbar visible | "Hi, we're..." |
| 2 | Popup open, summary hidden | Feature walkthrough |
| 3 | Settings page | Persona + options |
| 4 | Reuters article | Baseline demo |
| 5 | Fox News opinion | Right demo |
| 6 | Guardian opinion | Left demo |
| 7 | Reddit/CNN comments | UGC demo |
| 8 | Downloaded CSV opened | Export proof |
| 9 | Diagram of architecture (optional slide) | Technical details |
| 10 | Slide or terminal showing commit history | Challenges |

## Appendix B — Backup Demo URLs

If a primary site fails to load, is paywalled, or behaves unexpectedly:

**Baseline / low bias:**
- AP News (search top stories): https://apnews.com/
- BBC News world section: https://www.bbc.com/news/world
- Reuters world: https://www.reuters.com/world/
- Washington Post on the same Iran story: https://www.washingtonpost.com/world/2026/04/18/iran-strait-hormuz-us-oil/

**Right-leaning opinion:**
- Alternate Fox opinion: https://www.foxnews.com/opinion/top-democrat-governors-hoping-ride-records-white-house-can-they
- National Review Corner: https://www.nationalreview.com/corner/
- Wall Street Journal opinion: https://www.wsj.com/opinion

**Left-leaning opinion:**
- Guardian Comment is Free homepage: https://www.theguardian.com/commentisfree
- HuffPost opinion: https://www.huffpost.com/voices
- Vox explainers: https://www.vox.com/

**User-generated content:**
- Hacker News active thread: https://news.ycombinator.com/
- YouTube comments on any recent political video
- CNN live-updates page comment section: https://www.cnn.com/2026/04/19/world/live-news/iran-war-us-trump-hormuz

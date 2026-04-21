import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ChartColumn,
  Sparkles,
  Target,
  TriangleAlert
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Separator } from "../components/ui/separator";
import { cn } from "../lib/utils";

type BiasCategory =
  | "emotional_language"
  | "exaggeration"
  | "stereotype"
  | "generalization"
  | "false_equivalence";

type BiasLevel = "Low bias" | "Moderate bias" | "High bias" | "Extreme bias";

type AnalysisSummary = {
  count: number;
  totalSentences: number;
  biasScore: number;
  biasLevel: BiasLevel;
  categoryCounts: Record<BiasCategory, number>;
};

const EMPTY_COUNTS: Record<BiasCategory, number> = {
  emotional_language: 0,
  exaggeration: 0,
  stereotype: 0,
  generalization: 0,
  false_equivalence: 0
};

const CATEGORY_METADATA: Array<{
  key: BiasCategory;
  label: string;
  tone: string;
}> = [
  { key: "emotional_language", label: "Emotional Language", tone: "bg-amber-300/80" },
  { key: "exaggeration", label: "Exaggeration", tone: "bg-orange-300/80" },
  { key: "stereotype", label: "Stereotype", tone: "bg-rose-300/80" },
  { key: "generalization", label: "Generalization", tone: "bg-violet-300/80" },
  { key: "false_equivalence", label: "False Equivalence", tone: "bg-cyan-300/80" }
];

function getBiasBarClassName(biasLevel: BiasLevel) {
  if (biasLevel === "Low bias") {
    return "bg-emerald-400";
  }
  if (biasLevel === "Moderate bias") {
    return "bg-amber-300";
  }
  if (biasLevel === "High bias") {
    return "bg-orange-300";
  }
  return "bg-rose-400";
}

function getBiasAccentClassName(biasLevel: BiasLevel) {
  if (biasLevel === "Low bias") {
    return "text-emerald-300";
  }
  if (biasLevel === "Moderate bias") {
    return "text-amber-200";
  }
  if (biasLevel === "High bias") {
    return "text-orange-200";
  }
  return "text-rose-300";
}

function createEmptySummary(): AnalysisSummary {
  return {
    count: 0,
    totalSentences: 0,
    biasScore: 0,
    biasLevel: "Low bias",
    categoryCounts: { ...EMPTY_COUNTS }
  };
}

async function sendAnalyzeMessage(tabId: number) {
  return chrome.tabs.sendMessage(
    tabId,
    {
      type: "ANALYZE_PAGE"
    },
    {
      frameId: 0
    }
  ) as Promise<AnalysisSummary | undefined>;
}

async function ensureContentScriptInjected(tabId: number) {
  await chrome.scripting.insertCSS({
    target: { tabId, frameIds: [0] },
    files: ["styles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ["content.js"]
  });
}

function LogoMark() {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,156,255,0.28),transparent_60%)]" />
      <svg viewBox="0 0 48 48" className="relative h-7 w-7 text-white" aria-hidden="true">
        <path
          d="M14 31.5L23.5 12l4.4 9.15L34 31.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 31.5h12"
          fill="none"
          stroke="#8b9cff"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

const STORAGE_PREFIX = "bias-beacon:summary:";

type PersistedState = { summary: AnalysisSummary; resultText: string };

async function getActiveTabUrl(): Promise<string | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
}

async function loadPersistedSummary(): Promise<PersistedState | null> {
  try {
    const url = await getActiveTabUrl();
    if (!url) return null;
    const key = STORAGE_PREFIX + url;
    const stored = await chrome.storage.session.get(key);
    const entry = stored[key] as PersistedState | undefined;
    return entry ?? null;
  } catch {
    return null;
  }
}

async function savePersistedSummary(state: PersistedState) {
  try {
    const url = await getActiveTabUrl();
    if (!url) return;
    await chrome.storage.session.set({ [STORAGE_PREFIX + url]: state });
  } catch {
    // best-effort
  }
}

export function Popup() {
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [resultText, setResultText] = useState("Click the button to scan this page.");
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPersistedSummary().then((entry) => {
      if (cancelled || !entry) return;
      setSummary(entry.summary);
      setResultText(entry.resultText);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedSummary = summary ?? createEmptySummary();
  const biasPercent = Math.round(normalizedSummary.biasScore * 100);

  const quickStats = useMemo(
    () => [
      { label: "Biased", value: normalizedSummary.count },
      { label: "Sentences", value: normalizedSummary.totalSentences },
      { label: "Score", value: `${biasPercent}%` }
    ],
    [biasPercent, normalizedSummary.count, normalizedSummary.totalSentences]
  );

  async function analyzeActiveTab() {
    if (analysisRunning) {
      return;
    }

    setAnalysisRunning(true);
    setResultText("Analyzing page...");

    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!activeTab?.id) {
        setResultText("No active tab available.");
        return;
      }

      if (
        activeTab.url?.startsWith("chrome://") ||
        activeTab.url?.startsWith("chrome-extension://") ||
        activeTab.url?.startsWith("edge://") ||
        activeTab.url?.startsWith("about:")
      ) {
        setResultText("Cannot analyze Chrome internal pages.");
        return;
      }

      let response: AnalysisSummary | undefined;

      try {
        response = await sendAnalyzeMessage(activeTab.id);
      } catch (error) {
        if (!String((error as Error)?.message || "").includes("Receiving end does not exist")) {
          throw error;
        }

        await ensureContentScriptInjected(activeTab.id);
        response = await sendAnalyzeMessage(activeTab.id);
      }

      if (!response) {
        setResultText("No response from page.");
        return;
      }

      const nextSummary = {
        ...createEmptySummary(),
        ...response,
        categoryCounts: {
          ...EMPTY_COUNTS,
          ...(response.categoryCounts ?? {})
        }
      };

      const nextResultText = `${nextSummary.count} potentially biased sentence${
        nextSummary.count === 1 ? "" : "s"
      } detected.`;
      setSummary(nextSummary);
      setResultText(nextResultText);
      void savePersistedSummary({ summary: nextSummary, resultText: nextResultText });
    } catch (error) {
      console.error("Bias Beacon analysis failed:", error);
      setResultText("Unable to analyze this page.");
    } finally {
      setAnalysisRunning(false);
    }
  }

  return (
    <div className="relative min-h-[620px] overflow-hidden bg-grid-radial px-4 py-4 text-foreground">
      <motion.div
        className="pointer-events-none absolute inset-x-10 top-0 h-40 rounded-full bg-accent/10 blur-3xl"
        initial={{ opacity: 0.3, y: -16 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <Card className="relative overflow-hidden">
          <CardHeader className="gap-5 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <LogoMark />
                <div className="space-y-1">
                  <Badge variant="accent" className="w-fit">
                    Bias Beacon
                  </Badge>
                  <div>
                    <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-white">
                      Scan for loaded language
                    </h1>
                    <p className="max-w-[250px] text-sm leading-6 text-zinc-400">
                      A quieter, clearer way to inspect tone and bias across the page you are reading.
                    </p>
                  </div>
                </div>
              </div>
              <motion.div
                whileHover={{ y: -1 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-zinc-300"
              >
                <Sparkles className="h-4 w-4" />
              </motion.div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {quickStats.map((stat) => (
                <motion.div
                  key={stat.label}
                  whileHover={{ y: -2 }}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{stat.label}</p>
                  <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">{stat.value}</p>
                </motion.div>
              ))}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.18 }}>
              <Button
                type="button"
                size="lg"
                className="group w-full justify-between rounded-2xl"
                onClick={analyzeActiveTab}
                disabled={analysisRunning}
              >
                <span className="flex items-center gap-2">
                  {analysisRunning ? <Activity className="h-4 w-4 animate-pulse" /> : <ChartColumn className="h-4 w-4" />}
                  {analysisRunning ? "Analyzing" : "Analyze Page"}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </motion.div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3.5">
              <p className="text-sm leading-6 text-zinc-300">{resultText}</p>
            </div>

            <AnimatePresence initial={false}>
              {summary ? (
                <motion.section
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="space-y-5"
                >
                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white">
                        <Target className="h-4 w-4 text-accent" />
                        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-400">
                          Bias Summary
                        </h2>
                      </div>
                      <span className={cn("text-sm font-medium", getBiasAccentClassName(summary.biasLevel))}>
                        {summary.biasLevel}
                      </span>
                    </div>

                    <div className="grid gap-2">
                      <SummaryRow label="Biased Sentences" value={summary.count} />
                      <SummaryRow label="Total Sentences" value={summary.totalSentences} />
                      <SummaryRow label="Emotional Language" value={summary.categoryCounts.emotional_language} />
                      <SummaryRow label="Exaggeration" value={summary.categoryCounts.exaggeration} />
                      <SummaryRow label="Stereotype" value={summary.categoryCounts.stereotype} />
                      <SummaryRow label="Generalization" value={summary.categoryCounts.generalization} />
                      <SummaryRow label="False Equivalence" value={summary.categoryCounts.false_equivalence} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-zinc-400">Bias Score</span>
                      <span className="text-sm font-medium text-white">{biasPercent}%</span>
                    </div>
                    <Progress
                      value={biasPercent}
                      indicatorClassName={cn(getBiasBarClassName(summary.biasLevel), "shadow-[0_0_22px_rgba(139,156,255,0.25)]")}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <TriangleAlert className="h-4 w-4 text-zinc-500" />
                      <h3 className="text-sm font-medium uppercase tracking-[0.18em]">Highlight Legend</h3>
                    </div>
                    <div className="grid gap-2">
                      {CATEGORY_METADATA.map((category) => (
                        <motion.div
                          key={category.key}
                          whileHover={{ x: 2 }}
                          className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className={cn("h-2.5 w-2.5 rounded-full", category.tone)} />
                            <span className="text-sm text-zinc-300">{category.label}</span>
                          </div>
                          <span className="text-sm font-medium text-white">
                            {summary.categoryCounts[category.key]}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.section>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

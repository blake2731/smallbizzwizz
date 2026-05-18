import Anthropic from "@anthropic-ai/sdk"
import {
  calculatePercentChange,
  getExpenseMetrics,
  getLaborMetrics,
  getRevenueMetrics
} from "./metricCalculations"
import { getTrendData } from "./retrieval"
import type {
  ExpenseMetrics,
  InsightMetricUnit,
  InsightSeverity,
  InsightSupportingMetric,
  InsightTrendDirection,
  LaborMetrics,
  MetricSummary,
  NormalizedFinancialRecord,
  OperationalInsight,
  RevenueMetrics,
  TrendDataPoint
} from "./types"

export type NarrativeAudience =
  | "administrator"
  | "finance"
  | "operations"
  | "daily"

export type NarrativeSourceData = {
  insights: OperationalInsight[]
  summaryMetrics: {
    labor: LaborMetrics
    revenue: RevenueMetrics
    expense: ExpenseMetrics
  }
  trends: {
    revenue: TrendDataPoint[]
    expenses: TrendDataPoint[]
    labor: TrendDataPoint[]
    ebitdarm: TrendDataPoint[]
    netIncome: TrendDataPoint[]
    census: TrendDataPoint[]
    occupancy: TrendDataPoint[]
  }
  validation: {
    supportedSheetCount: number
    supportedIssueFreeSheetCount: number
    totalRecords: number
    normalizedRecordCount: number
    leafRecordCount: number
    totalIssueCount: number
  }
}

export type NarrativeMetricSnapshot = {
  label: string
  period?: string
  value: number | null
  baseline: number | null
  variance: number | null
  percentChange: number | null
  unit: InsightMetricUnit
  note?: string
}

export type NarrativeTrendSnapshot = {
  label: string
  currentPeriod: string
  previousPeriod: string
  currentValue: number | null
  previousValue: number | null
  delta: number | null
  percentChange: number | null
  unit: InsightMetricUnit
  trendDirection: InsightTrendDirection
  note?: string
}

export type NarrativeHighlight = {
  label: string
  detail: string
  severity: InsightSeverity
  supportingInsightIds: string[]
}

export type NarrativeInsightReference = {
  insightId: string
  type: OperationalInsight["type"]
  severity: OperationalInsight["severity"]
  category?: string
  subcategory?: string
  section?: string
  subsection?: string
  lineItem?: string
  period?: string
  title: string
  explanation: string
  trendDirection: OperationalInsight["trendDirection"]
  supportingMetrics: OperationalInsight["supportingMetrics"]
}

export type NarrativePromptContext = {
  audience: NarrativeAudience
  audienceLabel: string
  objective: string
  timeframe: string[]
  validation: NarrativeSourceData["validation"] & {
    insightCount: number
  }
  summaryMetrics: NarrativeMetricSnapshot[]
  trendMetrics: NarrativeTrendSnapshot[]
  operationalHighlights: NarrativeHighlight[]
  insights: NarrativeInsightReference[]
  instructions: string[]
}

export type NarrativeResult = {
  audience: NarrativeAudience
  status: "generated" | "skipped" | "error"
  model?: string
  promptContext: NarrativePromptContext
  promptText: string
  narrative: string | null
  error?: string
  supportingInsightIds: string[]
}

type TrendKey = keyof NarrativeSourceData["trends"]
type RollupKey = keyof NarrativeSourceData["summaryMetrics"]
type PointValueField = "actual" | "actualPpd"
type PointBaselineField = "budget" | "budgetPpd"
type PointVarianceField = "variance" | "variancePpd"

type MetricSpec = {
  label: string
  trend: TrendKey
  valueField: PointValueField
  baselineField: PointBaselineField
  varianceField: PointVarianceField
  unit: InsightMetricUnit
  multiplier?: number
  note?: string
  fallbackRollup?: RollupKey
}

type TrendSpec = {
  label: string
  trend: TrendKey
  valueField: PointValueField
  unit: InsightMetricUnit
  positiveMeans: "improving" | "deteriorating"
  multiplier?: number
  note?: string
}

const MODEL_NAME = process.env.NURSING_HOME_NARRATIVE_MODEL ?? "claude-sonnet-4-6"
const NARRATIVE_SYSTEM_PROMPT = `You are the executive narrative layer for a nursing-home operating-finance system.

Rules:
- Use only the provided validated insight packets, summary metrics, and trend metrics.
- Do not invent numbers, causes, or operational facts.
- Do not claim to have reviewed a workbook, spreadsheet, or raw rows directly.
- Do not perform fresh calculations beyond the values already provided.
- Keep the narrative tight, executive, and operationally useful.
- If the context does not support a claim, leave it out.`

const MONTH_ORDER = new Map([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
  ["t12", 99]
])

const SEVERITY_WEIGHT: Record<OperationalInsight["severity"], number> = {
  high: 300,
  medium: 200,
  low: 100
}

const AUDIENCE_CONFIG: Record<
  NarrativeAudience,
  {
    label: string
    objective: string
    maxInsights: number
    maxHighlights: number
    maxTokens: number
    instructions: string[]
  }
> = {
  administrator: {
    label: "Administrator Summary",
    objective:
      "Summarize the most important validated financial and operating signals for an administrator balancing margin, staffing, and census.",
    maxInsights: 7,
    maxHighlights: 4,
    maxTokens: 700,
    instructions: [
      "Lead with the strongest current operating story for leadership.",
      "Explain why the most material risks matter now, using only the supplied metrics.",
      "Mention any material upside only if it is truly noteworthy.",
      "Return a one-line headline, one short summary paragraph, and three short bullets."
    ]
  },
  finance: {
    label: "Finance Summary",
    objective:
      "Summarize the validated budget variance, margin, revenue, and expense signals for finance leadership.",
    maxInsights: 8,
    maxHighlights: 4,
    maxTokens: 700,
    instructions: [
      "Prioritize budget variance, margin pressure, revenue mix, and cost control.",
      "Use exact directional language grounded in the packet metrics.",
      "Keep the tone executive and finance-forward, not generic.",
      "Return a one-line headline, one short summary paragraph, and three short bullets."
    ]
  },
  operations: {
    label: "Operational Summary",
    objective:
      "Summarize the validated staffing, census, occupancy, patient-day efficiency, and operating-expense signals for operators.",
    maxInsights: 7,
    maxHighlights: 4,
    maxTokens: 700,
    instructions: [
      "Prioritize labor, census, occupancy, and patient-day efficiency signals.",
      "Keep the narrative tied to measurable operational pressure points.",
      "Do not drift into unsupported causal storytelling.",
      "Return a one-line headline, one short summary paragraph, and three short bullets."
    ]
  },
  daily: {
    label: "Concise Daily Summary",
    objective:
      "Produce a concise daily-style briefing built only from the most material validated packets and metrics.",
    maxInsights: 4,
    maxHighlights: 3,
    maxTokens: 350,
    instructions: [
      "Keep the full response under 120 words.",
      "Focus only on the few items leadership should notice right now.",
      "Prefer short, direct sentences over broad explanation.",
      "Return a one-line headline, one short paragraph, and two bullets."
    ]
  }
}

const TYPE_PRIORITY: Record<
  NarrativeAudience,
  Partial<Record<OperationalInsight["type"], number>>
> = {
  administrator: {
    margin_compression: 9,
    revenue_decline: 9,
    labor_spike: 8,
    census_decline: 8,
    abnormal_expense_increase: 8,
    trend_deterioration: 7,
    negative_variance: 7,
    outlier: 6,
    positive_variance: 4
  },
  finance: {
    margin_compression: 10,
    revenue_decline: 9,
    abnormal_expense_increase: 9,
    negative_variance: 8,
    trend_deterioration: 8,
    outlier: 6,
    labor_spike: 5,
    positive_variance: 5,
    census_decline: 4
  },
  operations: {
    labor_spike: 10,
    census_decline: 9,
    abnormal_expense_increase: 8,
    trend_deterioration: 7,
    negative_variance: 6,
    outlier: 6,
    revenue_decline: 5,
    positive_variance: 4,
    margin_compression: 4
  },
  daily: {
    margin_compression: 10,
    revenue_decline: 9,
    labor_spike: 9,
    census_decline: 8,
    abnormal_expense_increase: 8,
    trend_deterioration: 8,
    negative_variance: 7,
    outlier: 6,
    positive_variance: 4
  }
}

const CATEGORY_PRIORITY: Record<NarrativeAudience, Partial<Record<string, number>>> = {
  administrator: {
    Summary: 8,
    Revenue: 7,
    Labor: 7,
    Census: 7,
    "Operating Expenses": 7
  },
  finance: {
    Summary: 9,
    Revenue: 8,
    "Operating Expenses": 8,
    Labor: 6,
    Census: 4
  },
  operations: {
    Labor: 9,
    Census: 8,
    "Operating Expenses": 7,
    Revenue: 5,
    Summary: 4
  },
  daily: {
    Summary: 8,
    Revenue: 7,
    Labor: 7,
    Census: 7,
    "Operating Expenses": 6
  }
}

const SUMMARY_METRIC_SPECS: Record<NarrativeAudience, MetricSpec[]> = {
  administrator: [
    {
      label: "Total Revenue",
      trend: "revenue",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "revenue"
    },
    {
      label: "Total Labor",
      trend: "labor",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "labor"
    },
    {
      label: "Total Operating Expenses",
      trend: "expenses",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "expense"
    },
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency"
    },
    {
      label: "Average Daily Census",
      trend: "census",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "count",
      note: "Uses patient-day averages to avoid month-length distortion."
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "percent",
      multiplier: 100,
      note: "Displayed as percentage points."
    }
  ],
  finance: [
    {
      label: "Total Revenue",
      trend: "revenue",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "revenue"
    },
    {
      label: "Total Labor",
      trend: "labor",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "labor"
    },
    {
      label: "Total Operating Expenses",
      trend: "expenses",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "expense"
    },
    {
      label: "EBITDARM",
      trend: "ebitdarm",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency"
    },
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency"
    }
  ],
  operations: [
    {
      label: "Total Labor",
      trend: "labor",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency",
      fallbackRollup: "labor"
    },
    {
      label: "Revenue per Patient Day",
      trend: "revenue",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "ppd"
    },
    {
      label: "Expense per Patient Day",
      trend: "expenses",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "ppd"
    },
    {
      label: "Average Daily Census",
      trend: "census",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "count",
      note: "Uses patient-day averages to avoid month-length distortion."
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "percent",
      multiplier: 100,
      note: "Displayed as percentage points."
    }
  ],
  daily: [
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "currency"
    },
    {
      label: "Revenue per Patient Day",
      trend: "revenue",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "ppd"
    },
    {
      label: "Labor per Patient Day",
      trend: "labor",
      valueField: "actualPpd",
      baselineField: "budgetPpd",
      varianceField: "variancePpd",
      unit: "ppd"
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      baselineField: "budget",
      varianceField: "variance",
      unit: "percent",
      multiplier: 100,
      note: "Displayed as percentage points."
    }
  ]
}

const TREND_SPECS: Record<NarrativeAudience, TrendSpec[]> = {
  administrator: [
    {
      label: "Revenue per Patient Day",
      trend: "revenue",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "improving"
    },
    {
      label: "Labor per Patient Day",
      trend: "labor",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "deteriorating"
    },
    {
      label: "Expense per Patient Day",
      trend: "expenses",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "deteriorating"
    },
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "improving"
    },
    {
      label: "Average Daily Census",
      trend: "census",
      valueField: "actualPpd",
      unit: "count",
      positiveMeans: "improving"
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      unit: "percent",
      multiplier: 100,
      positiveMeans: "improving",
      note: "Delta is expressed in percentage points."
    }
  ],
  finance: [
    {
      label: "Total Revenue",
      trend: "revenue",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "improving"
    },
    {
      label: "Total Operating Expenses",
      trend: "expenses",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "deteriorating"
    },
    {
      label: "Total Labor",
      trend: "labor",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "deteriorating"
    },
    {
      label: "EBITDARM",
      trend: "ebitdarm",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "improving"
    },
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "improving"
    }
  ],
  operations: [
    {
      label: "Labor per Patient Day",
      trend: "labor",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "deteriorating"
    },
    {
      label: "Average Daily Census",
      trend: "census",
      valueField: "actualPpd",
      unit: "count",
      positiveMeans: "improving"
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      unit: "percent",
      multiplier: 100,
      positiveMeans: "improving",
      note: "Delta is expressed in percentage points."
    },
    {
      label: "Revenue per Patient Day",
      trend: "revenue",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "improving"
    },
    {
      label: "Expense per Patient Day",
      trend: "expenses",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "deteriorating"
    }
  ],
  daily: [
    {
      label: "Net Income",
      trend: "netIncome",
      valueField: "actual",
      unit: "currency",
      positiveMeans: "improving"
    },
    {
      label: "Revenue per Patient Day",
      trend: "revenue",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "improving"
    },
    {
      label: "Labor per Patient Day",
      trend: "labor",
      valueField: "actualPpd",
      unit: "ppd",
      positiveMeans: "deteriorating"
    },
    {
      label: "Occupancy",
      trend: "occupancy",
      valueField: "actual",
      unit: "percent",
      multiplier: 100,
      positiveMeans: "improving",
      note: "Delta is expressed in percentage points."
    }
  ]
}

export const NARRATIVE_AUDIENCES: NarrativeAudience[] = [
  "administrator",
  "finance",
  "operations",
  "daily"
]

let anthropicClient: Anthropic | null = null

export function parseNarrativeAudience(
  value: string | string[] | undefined
): NarrativeAudience {
  const candidate = Array.isArray(value) ? value[0] : value
  return NARRATIVE_AUDIENCES.includes(candidate as NarrativeAudience)
    ? (candidate as NarrativeAudience)
    : "administrator"
}

export function buildNarrativeSourceData(
  records: NormalizedFinancialRecord[],
  insights: OperationalInsight[],
  validation: NarrativeSourceData["validation"]
): NarrativeSourceData {
  return {
    insights,
    summaryMetrics: {
      labor: getLaborMetrics(records),
      revenue: getRevenueMetrics(records),
      expense: getExpenseMetrics(records)
    },
    trends: {
      revenue: getTrendData(records, {
        category: "Revenue",
        includeHidden: false
      }),
      expenses: getTrendData(records, {
        category: "Operating Expenses",
        includeHidden: false
      }),
      labor: getTrendData(records, {
        category: "Labor",
        includeHidden: false
      }),
      ebitdarm: getTrendData(records, {
        category: "Summary",
        subcategory: "EBITDARM",
        includeHidden: false,
        includeTotals: true
      }),
      netIncome: getTrendData(records, {
        category: "Summary",
        subcategory: "Net Income",
        includeHidden: false,
        includeTotals: true
      }),
      census: getTrendData(records, {
        category: "Census",
        subcategory: "Total Census",
        includeHidden: false,
        includeTotals: true
      }),
      occupancy: getTrendData(records, {
        category: "Census",
        subcategory: "Occupancy %",
        includeHidden: false,
        includeTotals: true
      })
    },
    validation
  }
}

export function buildNarrativePromptContext(
  source: NarrativeSourceData,
  audience: NarrativeAudience
): NarrativePromptContext {
  const config = AUDIENCE_CONFIG[audience]
  const selectedInsights = selectInsightsForAudience(
    source.insights,
    audience,
    config.maxInsights
  ).map(toNarrativeInsightReference)

  const summaryMetrics = SUMMARY_METRIC_SPECS[audience]
    .map((spec) => buildMetricSnapshot(source, spec))
    .filter(
      (metric): metric is NarrativeMetricSnapshot =>
        metric !== null
    )

  const trendMetrics = TREND_SPECS[audience]
    .map((spec) => buildTrendSnapshot(source, spec))
    .filter(
      (trend): trend is NarrativeTrendSnapshot =>
        trend !== null
    )

  return {
    audience,
    audienceLabel: config.label,
    objective: config.objective,
    timeframe: deriveTimeframe(summaryMetrics, trendMetrics, selectedInsights),
    validation: {
      ...source.validation,
      insightCount: source.insights.length
    },
    summaryMetrics,
    trendMetrics,
    operationalHighlights: buildOperationalHighlights(
      selectedInsights,
      config.maxHighlights
    ),
    insights: selectedInsights,
    instructions: config.instructions
  }
}

export function buildNarrativePromptText(
  context: NarrativePromptContext
): string {
  const lines: string[] = []

  lines.push(`Audience: ${context.audienceLabel}`)
  lines.push(`Objective: ${context.objective}`)
  lines.push(
    `Timeframe: ${
      context.timeframe.length > 0
        ? context.timeframe.join(", ")
        : "Current loaded workbook periods"
    }`
  )
  lines.push("")
  lines.push("Validation:")
  lines.push(`- Supported sheets: ${context.validation.supportedSheetCount}`)
  lines.push(
    `- Issue-free supported sheets: ${context.validation.supportedIssueFreeSheetCount}`
  )
  lines.push(`- Validation issues: ${context.validation.totalIssueCount}`)
  lines.push(`- Parsed records: ${context.validation.totalRecords}`)
  lines.push(`- Normalized records: ${context.validation.normalizedRecordCount}`)
  lines.push(`- Leaf records: ${context.validation.leafRecordCount}`)
  lines.push(`- Insight packets available: ${context.validation.insightCount}`)
  lines.push("")
  lines.push("Summary metrics:")
  for (const metric of context.summaryMetrics) {
    lines.push(`- ${formatPromptSummaryMetric(metric)}`)
  }

  lines.push("")
  lines.push("Trend metrics:")
  for (const trend of context.trendMetrics) {
    lines.push(`- ${formatPromptTrendMetric(trend)}`)
  }

  lines.push("")
  lines.push("Operational highlights:")
  for (const highlight of context.operationalHighlights) {
    lines.push(
      `- ${highlight.severity.toUpperCase()} | ${highlight.label} | ${highlight.detail} | packets=${highlight.supportingInsightIds.join(", ")}`
    )
  }

  lines.push("")
  lines.push("Insight packets:")
  for (const insight of context.insights) {
    lines.push(
      `- ${insight.insightId} | ${insight.severity} | ${insight.type} | ${formatInsightReferencePath(insight)}`
    )
    lines.push(`  title: ${insight.title}`)
    lines.push(`  explanation: ${insight.explanation}`)
    lines.push(
      `  metrics: ${formatPromptSupportingMetrics(insight.supportingMetrics)}`
    )
  }

  lines.push("")
  lines.push("Response instructions:")
  for (const instruction of context.instructions) {
    lines.push(`- ${instruction}`)
  }
  lines.push("- Use only the facts above.")
  lines.push("- Do not mention packet IDs unless they improve clarity.")
  lines.push("- Do not cite a spreadsheet or workbook directly.")

  return lines.join("\n")
}

export async function generateExecutiveNarrative(
  source: NarrativeSourceData,
  audience: NarrativeAudience
): Promise<NarrativeResult> {
  const context = buildNarrativePromptContext(source, audience)
  const promptText = buildNarrativePromptText(context)
  const supportingInsightIds = context.insights.map((insight) => insight.insightId)

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      audience,
      status: "skipped",
      model: MODEL_NAME,
      promptContext: context,
      promptText,
      narrative: null,
      error: "ANTHROPIC_API_KEY is not set.",
      supportingInsightIds
    }
  }

  try {
    const client = getAnthropicClient()
    const config = AUDIENCE_CONFIG[audience]
    const response = await client.messages.create({
      model: MODEL_NAME,
      max_tokens: config.maxTokens,
      temperature: 0.2,
      cache_control: { type: "ephemeral" },
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: promptText
        }
      ]
    })

    const narrative = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n")

    return {
      audience,
      status: "generated",
      model: MODEL_NAME,
      promptContext: context,
      promptText,
      narrative: narrative || null,
      supportingInsightIds
    }
  } catch (error) {
    return {
      audience,
      status: "error",
      model: MODEL_NAME,
      promptContext: context,
      promptText,
      narrative: null,
      error: error instanceof Error ? error.message : "Narrative generation failed.",
      supportingInsightIds
    }
  }
}

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.")
  }

  anthropicClient ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  return anthropicClient
}

function selectInsightsForAudience(
  insights: OperationalInsight[],
  audience: NarrativeAudience,
  limit: number
): OperationalInsight[] {
  return [...insights]
    .sort((left, right) => compareInsightPriority(left, right, audience))
    .slice(0, limit)
}

function compareInsightPriority(
  left: OperationalInsight,
  right: OperationalInsight,
  audience: NarrativeAudience
): number {
  const scoreDiff =
    getInsightScore(right, audience) - getInsightScore(left, audience)
  if (scoreDiff !== 0) return scoreDiff

  const periodDiff = sortPeriods(
    left.period ?? "",
    right.period ?? ""
  )
  if (periodDiff !== 0) return periodDiff

  return left.title.localeCompare(right.title)
}

function getInsightScore(
  insight: OperationalInsight,
  audience: NarrativeAudience
): number {
  const severity = SEVERITY_WEIGHT[insight.severity]
  const typeWeight = TYPE_PRIORITY[audience][insight.type] ?? 0
  const categoryWeight = CATEGORY_PRIORITY[audience][insight.category ?? ""] ?? 0
  const magnitude = Math.min(getInsightMagnitude(insight) / 1000, 60)
  const upsidePenalty = insight.type === "positive_variance" ? -10 : 0
  const recency = MONTH_ORDER.get(normalizeKey(insight.period)) ?? 0

  return severity + typeWeight * 10 + categoryWeight * 6 + magnitude + upsidePenalty + recency
}

function buildMetricSnapshot(
  source: NarrativeSourceData,
  spec: MetricSpec
): NarrativeMetricSnapshot | null {
  const latest = source.trends[spec.trend].at(-1)
  if (latest) {
    const value = scaleValue(latest[spec.valueField], spec.multiplier)
    const baseline = scaleValue(latest[spec.baselineField], spec.multiplier)
    const variance = scaleValue(
      latest[spec.varianceField] ??
        calculateDifference(latest[spec.valueField], latest[spec.baselineField]),
      spec.multiplier
    )

    if (value === null && baseline === null && variance === null) {
      return null
    }

    return {
      label: spec.label,
      period: latest.period,
      value,
      baseline,
      variance,
      percentChange: calculatePercentChange(
        latest[spec.valueField],
        latest[spec.baselineField]
      ),
      unit: spec.unit,
      note: spec.note
    }
  }

  if (!spec.fallbackRollup) return null

  const rollup = getRollupMetric(source.summaryMetrics, spec.fallbackRollup)
  if (!rollup) return null

  const valueField = spec.valueField === "actual" ? "actual" : "actualPpd"
  const baselineField = spec.baselineField === "budget" ? "budget" : "budgetPpd"
  const varianceField = spec.varianceField === "variance" ? "variance" : "variancePpd"

  const value = scaleValue(rollup[valueField], spec.multiplier)
  const baseline = scaleValue(rollup[baselineField], spec.multiplier)
  const variance = scaleValue(rollup[varianceField], spec.multiplier)

  if (value === null && baseline === null && variance === null) {
    return null
  }

  return {
    label: spec.label,
    period: "Workbook Rollup",
    value,
    baseline,
    variance,
    percentChange: rollup.percentChange,
    unit: spec.unit,
    note:
      spec.note
        ? `${spec.note} Loaded workbook rollup across available periods.`
        : "Loaded workbook rollup across available periods."
  }
}

function buildTrendSnapshot(
  source: NarrativeSourceData,
  spec: TrendSpec
): NarrativeTrendSnapshot | null {
  const points = source.trends[spec.trend]
  if (points.length < 2) return null

  const previous = points.at(-2)
  const current = points.at(-1)
  if (!previous || !current) return null

  const currentValue = scaleValue(current[spec.valueField], spec.multiplier)
  const previousValue = scaleValue(previous[spec.valueField], spec.multiplier)
  const delta = calculateDifference(currentValue, previousValue)

  if (currentValue === null && previousValue === null && delta === null) {
    return null
  }

  return {
    label: spec.label,
    currentPeriod: current.period,
    previousPeriod: previous.period,
    currentValue,
    previousValue,
    delta,
    percentChange: calculatePercentChange(
      current[spec.valueField],
      previous[spec.valueField]
    ),
    unit: spec.unit,
    trendDirection: directionFromDelta(delta, spec.positiveMeans),
    note: spec.note
  }
}

function buildOperationalHighlights(
  insights: NarrativeInsightReference[],
  limit: number
): NarrativeHighlight[] {
  if (insights.length === 0) return []

  const highlights: NarrativeHighlight[] = []
  const downside = insights.filter((insight) => insight.type !== "positive_variance")
  const upside = insights.find((insight) => insight.type === "positive_variance")

  for (const insight of downside.slice(0, limit)) {
    highlights.push({
      label: insight.title,
      detail: compactHighlightDetail(insight),
      severity: insight.severity,
      supportingInsightIds: [insight.insightId]
    })
  }

  if (
    upside &&
    highlights.length < limit &&
    !highlights.some((highlight) =>
      highlight.supportingInsightIds.includes(upside.insightId)
    )
  ) {
    highlights.push({
      label: upside.title,
      detail: compactHighlightDetail(upside),
      severity: upside.severity,
      supportingInsightIds: [upside.insightId]
    })
  }

  return highlights.slice(0, limit)
}

function compactHighlightDetail(insight: NarrativeInsightReference): string {
  const metrics = prioritizeMetrics(insight.supportingMetrics)
    .slice(0, 2)
    .map(
      (metric) => `${metric.label} ${formatContextValue(metric.value, metric.unit)}`
    )
    .join("; ")

  const location = [insight.period, insight.category, insight.lineItem]
    .filter(Boolean)
    .join(" | ")

  return [location, metrics].filter(Boolean).join(" | ")
}

function toNarrativeInsightReference(
  insight: OperationalInsight
): NarrativeInsightReference {
  return {
    insightId: buildOperationalInsightId(insight),
    type: insight.type,
    severity: insight.severity,
    category: insight.category,
    subcategory: insight.subcategory,
    section: insight.section,
    subsection: insight.subsection,
    lineItem: insight.lineItem,
    period: insight.period,
    title: insight.title,
    explanation: insight.explanation,
    trendDirection: insight.trendDirection,
    supportingMetrics: insight.supportingMetrics
  }
}

export function buildOperationalInsightId(insight: OperationalInsight): string {
  const key = [
    insight.type,
    insight.period ?? "",
    insight.category ?? "",
    insight.subcategory ?? "",
    insight.section ?? "",
    insight.subsection ?? "",
    insight.lineItem ?? "",
    insight.title
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean)
    .join("-")
    .slice(0, 64)

  return `nh-${key || "insight"}`
}

function deriveTimeframe(
  metrics: NarrativeMetricSnapshot[],
  trends: NarrativeTrendSnapshot[],
  insights: NarrativeInsightReference[]
): string[] {
  const periods = new Set<string>()

  for (const metric of metrics) {
    if (metric.period && metric.period !== "Workbook Rollup") periods.add(metric.period)
  }

  for (const trend of trends) {
    periods.add(trend.previousPeriod)
    periods.add(trend.currentPeriod)
  }

  for (const insight of insights) {
    if (insight.period) periods.add(insight.period)
  }

  return [...periods].sort(sortPeriods).slice(-3).reverse()
}

function getRollupMetric(
  summaryMetrics: NarrativeSourceData["summaryMetrics"],
  key: RollupKey
): MetricSummary | null {
  if (key === "revenue") return summaryMetrics.revenue.total
  if (key === "labor") return summaryMetrics.labor.total
  if (key === "expense") return summaryMetrics.expense.total
  return null
}

function formatPromptSummaryMetric(metric: NarrativeMetricSnapshot): string {
  const parts = [
    metric.label,
    metric.period ? `period=${metric.period}` : null,
    `actual=${formatContextValue(metric.value, metric.unit)}`,
    `budget=${formatContextValue(metric.baseline, metric.unit)}`,
    `variance=${formatContextValue(metric.variance, metric.unit)}`,
    `variancePct=${formatPercent(metric.percentChange)}`
  ]

  if (metric.note) parts.push(`note=${metric.note}`)

  return parts.filter(Boolean).join(" | ")
}

function formatPromptTrendMetric(trend: NarrativeTrendSnapshot): string {
  const parts = [
    trend.label,
    `${trend.previousPeriod}=${formatContextValue(trend.previousValue, trend.unit)}`,
    `${trend.currentPeriod}=${formatContextValue(trend.currentValue, trend.unit)}`,
    `delta=${formatContextValue(trend.delta, trend.unit)}`,
    `changePct=${formatPercent(trend.percentChange)}`,
    `direction=${trend.trendDirection}`
  ]

  if (trend.note) parts.push(`note=${trend.note}`)

  return parts.join(" | ")
}

function formatInsightReferencePath(
  insight: NarrativeInsightReference
): string {
  const refs = [
    insight.category,
    insight.subcategory,
    insight.section,
    insight.subsection,
    insight.lineItem,
    insight.period
  ].filter(Boolean)

  return refs.join(" / ")
}

function formatPromptSupportingMetrics(
  metrics: InsightSupportingMetric[]
): string {
  return prioritizeMetrics(metrics)
    .slice(0, 4)
    .map(
      (metric) => `${metric.label}=${formatContextValue(metric.value, metric.unit)}`
    )
    .join("; ")
}

function prioritizeMetrics(
  metrics: InsightSupportingMetric[]
): InsightSupportingMetric[] {
  const priority = new Map([
    ["Variance", 1],
    ["Variance %", 2],
    ["Period-over-period change", 3],
    ["Change in percentage points", 4],
    ["Actual", 5],
    ["Budget", 6],
    ["Actual PPD", 7],
    ["Budget PPD", 8],
    ["Variance PPD", 9]
  ])

  return metrics
    .filter((metric) => metric.value !== null && metric.value !== undefined)
    .sort((left, right) => {
      const leftPriority = priority.get(left.label) ?? 99
      const rightPriority = priority.get(right.label) ?? 99
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return left.label.localeCompare(right.label)
    })
}

function getInsightMagnitude(insight: OperationalInsight): number {
  return insight.supportingMetrics.reduce((max, metric) => {
    if (typeof metric.value !== "number") return max
    return Math.max(max, Math.abs(metric.value))
  }, 0)
}

function directionFromDelta(
  delta: number | null,
  positiveMeans: "improving" | "deteriorating"
): InsightTrendDirection {
  if (delta === null || delta === 0) return "stable"

  if (delta > 0) return positiveMeans
  return positiveMeans === "improving" ? "deteriorating" : "improving"
}

function scaleValue(
  value: number | null | undefined,
  multiplier?: number
): number | null {
  if (value === null || value === undefined) return null
  return multiplier ? value * multiplier : value
}

function calculateDifference(
  left: number | null | undefined,
  right: number | null | undefined
): number | null {
  if (left === null && right === null) return null
  if (left === undefined && right === undefined) return null
  return (left ?? 0) - (right ?? 0)
}

function formatContextValue(
  value: number | string | null | undefined,
  unit?: InsightMetricUnit
): string {
  if (value === null || value === undefined) return "n/a"
  if (typeof value === "string") return value

  if (unit === "currency") {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    })
  }

  if (unit === "percent") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })}%`
  }

  if (unit === "ppd") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ppd`
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a"
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`
}

function sortPeriods(left: string, right: string): number {
  const leftIndex = MONTH_ORDER.get(normalizeKey(left)) ?? Number.MAX_SAFE_INTEGER
  const rightIndex = MONTH_ORDER.get(normalizeKey(right)) ?? Number.MAX_SAFE_INTEGER

  if (leftIndex !== rightIndex) return leftIndex - rightIndex
  return left.localeCompare(right)
}

function normalizeKey(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[/%(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

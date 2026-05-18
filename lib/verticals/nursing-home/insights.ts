import {
  calculatePercentChange,
  calculateVariance
} from "./metricCalculations"
import {
  getRecordsByCategory,
  getTopVariances,
  getTrendData
} from "./retrieval"
import type {
  InsightSeverity,
  InsightSupportingMetric,
  InsightThreshold,
  InsightTrendDirection,
  InsightType,
  NormalizedFinancialRecord,
  OperationalInsight,
  TopVarianceRecord,
  TrendDataPoint
} from "./types"

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

const VARIANCE_AMOUNT_THRESHOLD = 10000
const VARIANCE_PERCENT_THRESHOLD = 10

const LABOR_SPIKE_AMOUNT_THRESHOLD = 5000
const LABOR_SPIKE_PERCENT_THRESHOLD = 10
const LABOR_SPIKE_PPD_THRESHOLD = 0.75

const REVENUE_DECLINE_AMOUNT_THRESHOLD = 10000
const REVENUE_DECLINE_PERCENT_THRESHOLD = -10

const EXPENSE_INCREASE_AMOUNT_THRESHOLD = 3000
const EXPENSE_INCREASE_PERCENT_THRESHOLD = 15

const MARGIN_COMPRESSION_AMOUNT_THRESHOLD = 25000
const MARGIN_COMPRESSION_PERCENT_THRESHOLD = -10

const REVENUE_TREND_PERCENT_THRESHOLD = -5
const EXPENSE_TREND_PERCENT_THRESHOLD = 5
const NET_INCOME_TREND_PERCENT_THRESHOLD = -10

const CENSUS_DECLINE_PPD_THRESHOLD = -0.5
const OCCUPANCY_DECLINE_PERCENTAGE_POINTS = -1

const OUTLIER_MINIMUM_BY_CATEGORY: Record<string, number> = {
  Revenue: 10000,
  Labor: 5000,
  "Operating Expenses": 3000
}

export function generateInsightPackets(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const insights = [
    ...generateVarianceInsights(records),
    ...generateLaborInsights(records),
    ...generateRevenueInsights(records),
    ...generateTrendInsights(records),
    ...generateOutlierInsights(records)
  ]

  return dedupeInsights(insights).sort(compareInsights)
}

export function generateVarianceInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const negative = getTopVariances(records, {
    direction: "negative",
    limit: 6,
    includeHidden: false,
    includeTotals: false
  })
    .filter((record) => record.category !== "Summary")
    .filter((record) => shouldSurfaceVariance(record, "negative"))
    .map((record) =>
      createVarianceInsight(
        record,
        "negative_variance",
        "deteriorating",
        `${record.period ?? record.sheetName} ${insightLabel(record)} is materially below budget`,
        `${insightLabel(record)} posted a negative variance that exceeds the deterministic variance threshold, making it a direct operational shortfall rather than an AI-derived guess.`
      )
    )

  const positive = getTopVariances(records, {
    direction: "positive",
    limit: 6,
    includeHidden: false,
    includeTotals: false
  })
    .filter((record) => record.category !== "Summary")
    .filter((record) => shouldSurfaceVariance(record, "positive"))
    .map((record) =>
      createVarianceInsight(
        record,
        "positive_variance",
        "improving",
        `${record.period ?? record.sheetName} ${insightLabel(record)} is materially above budget`,
        `${insightLabel(record)} delivered a positive variance that exceeds the deterministic variance threshold, so this is a measurable upside driver rather than a narrative interpretation.`
      )
    )

  const abnormalExpenseIncreases = getTopVariances(records, {
    direction: "positive",
    limit: 4,
    category: "Operating Expenses",
    includeHidden: false,
    includeTotals: false
  })
    .filter(shouldSurfaceExpenseIncrease)
    .map((record) =>
      createVarianceInsight(
        record,
        "abnormal_expense_increase",
        "deteriorating",
        `${record.period ?? record.sheetName} ${insightLabel(record)} expense increase is above threshold`,
        `${insightLabel(record)} is running above budget by enough dollars and percentage to qualify as an abnormal expense increase under the deterministic ruleset.`
      )
    )

  return [...negative, ...positive, ...abnormalExpenseIncreases]
}

export function generateLaborInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const laborTotals = getRecordsByCategory(records, "Labor", {
    includeHidden: false,
    includeTotals: true,
    metricsOnly: true
  })
    .filter((record) => record.isTotal)
    .filter(isComparableLaborTotal)
    .filter((record) => (record.actual ?? 0) !== 0 || (record.budget ?? 0) !== 0)
    .filter((record) => shouldSurfaceLaborSpike(record))
    .sort((left, right) => (right.variance ?? 0) - (left.variance ?? 0))
    .slice(0, 6)

  return laborTotals.map((record) => {
    const percentChange = calculatePercentChange(record.actual, record.budget)
    return {
      type: "labor_spike",
      severity: getSeverity(record.variance, percentChange, record.variancePpd, {
        mediumAmount: LABOR_SPIKE_AMOUNT_THRESHOLD,
        highAmount: 15000,
        mediumPercent: LABOR_SPIKE_PERCENT_THRESHOLD,
        highPercent: 20,
        mediumPpd: LABOR_SPIKE_PPD_THRESHOLD,
        highPpd: 2
      }),
      category: record.category,
      subcategory: record.subsection ?? record.subcategory,
      section: record.section,
      subsection: record.subsection,
      title: `${record.period ?? record.sheetName} ${record.subsection ?? record.subcategory ?? "labor"} labor spike`,
      explanation: `${record.subsection ?? record.subcategory ?? "Labor"} exceeded budget by a deterministic labor-spike threshold, which makes this a candidate operational staffing pressure point before any AI explanation layer is applied.`,
      triggerReason: `${record.subsection ?? record.subcategory ?? "Labor"} exceeded at least one labor-spike threshold for dollars, percent variance, or patient-day intensity.`,
      supportingMetrics: [
        metric("Actual", record.actual, "currency"),
        metric("Budget", record.budget, "currency"),
        metric("Variance", record.variance ?? calculateVariance(record.actual, record.budget), "currency"),
        metric("Variance %", percentChange, "percent"),
        metric("Actual PPD", record.actualPpd, "ppd"),
        metric("Budget PPD", record.budgetPpd, "ppd"),
        metric("Variance PPD", record.variancePpd, "ppd")
      ],
      thresholdsExceeded: compactThresholds([
        positiveThreshold(
          "Labor variance",
          record.variance ?? calculateVariance(record.actual, record.budget),
          LABOR_SPIKE_AMOUNT_THRESHOLD,
          "currency"
        ),
        positiveThreshold(
          "Labor variance %",
          percentChange,
          LABOR_SPIKE_PERCENT_THRESHOLD,
          "percent"
        ),
        positiveThreshold(
          "Labor variance PPD",
          record.variancePpd ?? calculateVariance(record.actualPpd, record.budgetPpd),
          LABOR_SPIKE_PPD_THRESHOLD,
          "ppd"
        )
      ]),
      periodsInvolved: periods(record.period ?? record.sheetName),
      trendDirection: "deteriorating",
      period: record.period,
      lineItem: record.lineItem
    }
  })
}

export function generateRevenueInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const declines = getTopVariances(records, {
    direction: "negative",
    limit: 6,
    category: "Revenue",
    includeHidden: false,
    includeTotals: false
  })
    .filter((record) => shouldSurfaceRevenueDecline(record))
    .map((record) =>
      createVarianceInsight(
        record,
        "revenue_decline",
        "deteriorating",
        `${record.period ?? record.sheetName} ${insightLabel(record)} revenue decline`,
        `${insightLabel(record)} is under budget by enough dollars or percentage to qualify as a deterministic revenue-decline packet, which gives the future AI layer a structured fact pattern instead of raw rows.`
      )
    )

  return declines
}

export function generateTrendInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const insights: OperationalInsight[] = []

  const latestRevenuePair = getLatestTrendPair(
    getTrendData(records, {
      category: "Revenue",
      includeHidden: false
    })
  )
  if (latestRevenuePair) {
    const change = calculatePercentChange(
      latestRevenuePair.current.actualPpd,
      latestRevenuePair.previous.actualPpd
    )
    if (
      change !== null &&
      change <= REVENUE_TREND_PERCENT_THRESHOLD
    ) {
      insights.push({
        type: "trend_deterioration",
        severity: getSeverity(
          calculateVariance(
            latestRevenuePair.current.actual,
            latestRevenuePair.previous.actual
          ),
          change,
          calculateVariance(
            latestRevenuePair.current.actualPpd,
            latestRevenuePair.previous.actualPpd
          ),
          {
            mediumAmount: 15000,
            highAmount: 40000,
            mediumPercent: 5,
            highPercent: 12,
            mediumPpd: 250,
            highPpd: 750
          }
        ),
        category: "Revenue",
        subcategory: "Total Revenue",
        section: "Revenue",
        subsection: "Total Revenue",
        title: `${latestRevenuePair.current.period} revenue trend deteriorated from ${latestRevenuePair.previous.period}`,
        explanation: `Total revenue per patient day declined period over period by more than the deterministic deterioration threshold, so this is a concrete trend signal rather than a narrative guess.`,
        triggerReason: `Revenue per patient day deteriorated beyond the configured period-over-period threshold.`,
        supportingMetrics: [
          metric(`${latestRevenuePair.previous.period} revenue`, latestRevenuePair.previous.actual, "currency"),
          metric(`${latestRevenuePair.current.period} revenue`, latestRevenuePair.current.actual, "currency"),
          metric(`${latestRevenuePair.previous.period} revenue PPD`, latestRevenuePair.previous.actualPpd, "ppd"),
          metric(`${latestRevenuePair.current.period} revenue PPD`, latestRevenuePair.current.actualPpd, "ppd"),
          metric("Period-over-period change", change, "percent")
        ],
        thresholdsExceeded: compactThresholds([
          negativeThreshold(
            "Revenue PPD change %",
            change,
            REVENUE_TREND_PERCENT_THRESHOLD,
            "percent"
          )
        ]),
        periodsInvolved: periods(
          latestRevenuePair.previous.period,
          latestRevenuePair.current.period
        ),
        trendDirection: "deteriorating",
        period: latestRevenuePair.current.period,
        lineItem: "Revenue"
      })
    }
  }

  const latestExpensePair = getLatestTrendPair(
    getTrendData(records, {
      category: "Operating Expenses",
      includeHidden: false
    })
  )
  if (latestExpensePair) {
    const change = calculatePercentChange(
      latestExpensePair.current.actualPpd,
      latestExpensePair.previous.actualPpd
    )
    if (
      change !== null &&
      change >= EXPENSE_TREND_PERCENT_THRESHOLD
    ) {
      insights.push({
        type: "trend_deterioration",
        severity: getSeverity(
          calculateVariance(
            latestExpensePair.current.actual,
            latestExpensePair.previous.actual
          ),
          change,
          calculateVariance(
            latestExpensePair.current.actualPpd,
            latestExpensePair.previous.actualPpd
          ),
          {
            mediumAmount: 10000,
            highAmount: 25000,
            mediumPercent: 5,
            highPercent: 15,
            mediumPpd: 5,
            highPpd: 15
          }
        ),
        category: "Operating Expenses",
        subcategory: "Total Operating Expenses",
        section: "Operating Expenses",
        subsection: "Total Operating Expenses",
        title: `${latestExpensePair.current.period} expense trend deteriorated from ${latestExpensePair.previous.period}`,
        explanation: `Operating expense per patient day increased more than the deterministic deterioration threshold between periods, which makes this a measurable cost-trend issue for later AI narration.`,
        triggerReason: `Expense per patient day increased beyond the configured deterioration threshold.`,
        supportingMetrics: [
          metric(`${latestExpensePair.previous.period} expenses`, latestExpensePair.previous.actual, "currency"),
          metric(`${latestExpensePair.current.period} expenses`, latestExpensePair.current.actual, "currency"),
          metric(`${latestExpensePair.previous.period} expense PPD`, latestExpensePair.previous.actualPpd, "ppd"),
          metric(`${latestExpensePair.current.period} expense PPD`, latestExpensePair.current.actualPpd, "ppd"),
          metric("Period-over-period change", change, "percent")
        ],
        thresholdsExceeded: compactThresholds([
          positiveThreshold(
            "Expense PPD change %",
            change,
            EXPENSE_TREND_PERCENT_THRESHOLD,
            "percent"
          )
        ]),
        periodsInvolved: periods(
          latestExpensePair.previous.period,
          latestExpensePair.current.period
        ),
        trendDirection: "deteriorating",
        period: latestExpensePair.current.period,
        lineItem: "Operating Expenses"
      })
    }
  }

  const totalCensusPair = getLatestTrendPair(
    getTrendData(records, {
      category: "Census",
      subcategory: "Total Census",
      includeHidden: false
    })
  )
  if (totalCensusPair) {
    const censusPpdDelta = calculateVariance(
      totalCensusPair.current.actualPpd,
      totalCensusPair.previous.actualPpd
    )
    if (
      censusPpdDelta !== null &&
      censusPpdDelta <= CENSUS_DECLINE_PPD_THRESHOLD
    ) {
      insights.push({
        type: "census_decline",
        severity: getSeverity(
          null,
          calculatePercentChange(
            totalCensusPair.current.actualPpd,
            totalCensusPair.previous.actualPpd
          ),
          censusPpdDelta,
          {
            mediumAmount: 0,
            highAmount: 0,
            mediumPercent: 1,
            highPercent: 3,
            mediumPpd: 0.5,
            highPpd: 1.5
          }
        ),
        category: "Census",
        subcategory: "Total Census",
        section: "Census",
        subsection: "Total Census",
        title: `${totalCensusPair.current.period} average census declined from ${totalCensusPair.previous.period}`,
        explanation: `Average daily census fell period over period on a patient-day basis, which avoids false alarms caused only by different month lengths.`,
        triggerReason: `Average daily census fell below the configured period-over-period decline threshold.`,
        supportingMetrics: [
          metric(`${totalCensusPair.previous.period} average census`, totalCensusPair.previous.actualPpd, "count"),
          metric(`${totalCensusPair.current.period} average census`, totalCensusPair.current.actualPpd, "count"),
          metric("Daily census delta", censusPpdDelta, "count"),
          metric(
            "Period-over-period change",
            calculatePercentChange(
              totalCensusPair.current.actualPpd,
              totalCensusPair.previous.actualPpd
            ),
            "percent"
          )
        ],
        thresholdsExceeded: compactThresholds([
          negativeThreshold(
            "Daily census delta",
            censusPpdDelta,
            CENSUS_DECLINE_PPD_THRESHOLD,
            "count"
          )
        ]),
        periodsInvolved: periods(
          totalCensusPair.previous.period,
          totalCensusPair.current.period
        ),
        trendDirection: "deteriorating",
        period: totalCensusPair.current.period,
        lineItem: "Total Census"
      })
    }
  }

  const occupancyPair = getLatestTrendPair(
    getTrendData(records, {
      category: "Census",
      subcategory: "Occupancy %",
      includeHidden: false
    })
  )
  if (occupancyPair) {
    const occupancyDeltaPoints =
      occupancyPair.current.actual !== null &&
      occupancyPair.previous.actual !== null
        ? (occupancyPair.current.actual - occupancyPair.previous.actual) * 100
        : null

    if (
      occupancyDeltaPoints !== null &&
      occupancyDeltaPoints <= OCCUPANCY_DECLINE_PERCENTAGE_POINTS
    ) {
      insights.push({
        type: "census_decline",
        severity: getSeverity(
          null,
          occupancyDeltaPoints,
          null,
          {
            mediumAmount: 0,
            highAmount: 0,
            mediumPercent: 1,
            highPercent: 3
          }
        ),
        category: "Census",
        subcategory: "Occupancy %",
        section: "Census",
        subsection: "Occupancy %",
        title: `${occupancyPair.current.period} occupancy declined from ${occupancyPair.previous.period}`,
        explanation: `Occupancy percentage fell by more than the deterministic threshold, so this packet captures a real census softening signal before any AI explanation is layered on top.`,
        triggerReason: `Occupancy dropped by more percentage points than the configured decline threshold.`,
        supportingMetrics: [
          metric(`${occupancyPair.previous.period} occupancy`, ratioToPercent(occupancyPair.previous.actual), "percent"),
          metric(`${occupancyPair.current.period} occupancy`, ratioToPercent(occupancyPair.current.actual), "percent"),
          metric("Change in percentage points", occupancyDeltaPoints, "percent")
        ],
        thresholdsExceeded: compactThresholds([
          negativeThreshold(
            "Occupancy change points",
            occupancyDeltaPoints,
            OCCUPANCY_DECLINE_PERCENTAGE_POINTS,
            "percent"
          )
        ]),
        periodsInvolved: periods(
          occupancyPair.previous.period,
          occupancyPair.current.period
        ),
        trendDirection: "deteriorating",
        period: occupancyPair.current.period,
        lineItem: "Occupancy %"
      })
    }
  }

  const marginInsights = generateMarginInsights(records)
  insights.push(...marginInsights)

  return insights
}

export function generateOutlierInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const categories = ["Revenue", "Labor", "Operating Expenses"] as const
  const insights: OperationalInsight[] = []

  for (const category of categories) {
    const categoryRecords = getRecordsByCategory(records, category, {
      includeHidden: false,
      includeTotals: false,
      metricsOnly: true
    }).filter((record) => record.variance !== null && record.variance !== undefined)

    if (categoryRecords.length < 8) continue

    const absoluteVariances = categoryRecords
      .map((record) => Math.abs(record.variance ?? 0))
      .sort((left, right) => left - right)

    const q1 = percentile(absoluteVariances, 0.25)
    const q3 = percentile(absoluteVariances, 0.75)
    const iqr = q3 - q1
    const cutoff = q3 + iqr * 1.5
    const floor = OUTLIER_MINIMUM_BY_CATEGORY[category]

    const outliers = categoryRecords
      .filter((record) => Math.abs(record.variance ?? 0) >= Math.max(cutoff, floor))
      .sort(
        (left, right) =>
          Math.abs(right.variance ?? 0) - Math.abs(left.variance ?? 0)
      )
      .slice(0, 3)

    for (const record of outliers) {
      const percentChange = calculatePercentChange(record.actual, record.budget)
      const trendDirection = insightDirectionFromVariance(record.variance)
      insights.push({
        type: "outlier",
        severity: getSeverity(record.variance, percentChange, record.variancePpd, {
          mediumAmount: floor,
          highAmount: Math.max(floor * 2, cutoff * 1.5),
          mediumPercent: 10,
          highPercent: 25,
          mediumPpd: 1,
          highPpd: 5
        }),
        category: record.category,
        subcategory: record.subcategory,
        section: record.section,
        subsection: record.subsection,
        title: `${record.period ?? record.sheetName} ${insightLabel(record)} is an outlier within ${category}`,
        explanation: `${insightLabel(record)} exceeded the deterministic outlier cutoff for ${category} variances, so it deserves explicit downstream explanation instead of being buried in raw row output.`,
        triggerReason: `${insightLabel(record)} exceeded the category-specific outlier cutoff derived from the interquartile range and minimum variance floor.`,
        supportingMetrics: [
          metric("Actual", record.actual, "currency"),
          metric("Budget", record.budget, "currency"),
          metric("Variance", record.variance, "currency"),
          metric("Variance %", percentChange, "percent"),
          metric("Peer outlier cutoff", cutoff, "currency")
        ],
        thresholdsExceeded: compactThresholds([
          absoluteThreshold(
            "Absolute variance",
            record.variance,
            Math.max(cutoff, floor),
            "currency"
          )
        ]),
        periodsInvolved: periods(record.period ?? record.sheetName),
        trendDirection,
        period: record.period,
        lineItem: record.lineItem
      })
    }
  }

  return insights
}

function generateMarginInsights(
  records: NormalizedFinancialRecord[]
): OperationalInsight[] {
  const insights: OperationalInsight[] = []
  const summaryCategories = ["EBITDARM", "Net Income"] as const

  for (const summary of summaryCategories) {
    const rows = records
      .filter((record) => !record.isHidden)
      .filter((record) => record.category === "Summary")
      .filter((record) => record.subcategory === summary)
      .sort((left, right) => sortPeriods(left.period ?? left.sheetName, right.period ?? right.sheetName))

    const latest = rows.at(-1)
    if (!latest) continue

    const percentChange = calculatePercentChange(latest.actual, latest.budget)
    const variance = latest.variance ?? calculateVariance(latest.actual, latest.budget)

    if (
      variance !== null &&
      variance <= -MARGIN_COMPRESSION_AMOUNT_THRESHOLD ||
      percentChange !== null &&
      percentChange <= MARGIN_COMPRESSION_PERCENT_THRESHOLD
    ) {
      insights.push({
        type: "margin_compression",
        severity: getSeverity(variance, percentChange, latest.variancePpd, {
          mediumAmount: MARGIN_COMPRESSION_AMOUNT_THRESHOLD,
          highAmount: 50000,
          mediumPercent: 10,
          highPercent: 20,
          mediumPpd: 5,
          highPpd: 15
        }),
        category: "Summary",
        subcategory: summary,
        section: latest.section ?? "Summary",
        subsection: latest.subsection,
        title: `${latest.period ?? latest.sheetName} ${summary} is materially below budget`,
        explanation: `${summary} is below budget by enough dollars or percentage to qualify as deterministic margin compression, which means the downstream AI layer can explain a structured packet instead of inferring from raw spreadsheets.`,
        triggerReason: `${summary} fell below budget by enough dollars or percentage to breach the configured margin-compression threshold.`,
        supportingMetrics: [
          metric("Actual", latest.actual, "currency"),
          metric("Budget", latest.budget, "currency"),
          metric("Variance", variance, "currency"),
          metric("Variance %", percentChange, "percent"),
          metric("Actual PPD", latest.actualPpd, "ppd"),
          metric("Budget PPD", latest.budgetPpd, "ppd"),
          metric("Variance PPD", latest.variancePpd, "ppd")
        ],
        thresholdsExceeded: compactThresholds([
          negativeThreshold(
            `${summary} variance`,
            variance,
            -MARGIN_COMPRESSION_AMOUNT_THRESHOLD,
            "currency"
          ),
          negativeThreshold(
            `${summary} variance %`,
            percentChange,
            MARGIN_COMPRESSION_PERCENT_THRESHOLD,
            "percent"
          )
        ]),
        periodsInvolved: periods(latest.period ?? latest.sheetName),
        trendDirection: "deteriorating",
        period: latest.period,
        lineItem: latest.lineItem
      })
    }

    const pair = getLatestRecordPair(rows)
    if (!pair) continue

    const trendPercent = calculatePercentChange(pair.current.actual, pair.previous.actual)
    if (
      trendPercent !== null &&
      trendPercent <= NET_INCOME_TREND_PERCENT_THRESHOLD
    ) {
      insights.push({
        type: "trend_deterioration",
        severity: getSeverity(
          calculateVariance(pair.current.actual, pair.previous.actual),
          trendPercent,
          calculateVariance(pair.current.actualPpd, pair.previous.actualPpd),
          {
            mediumAmount: 10000,
            highAmount: 30000,
            mediumPercent: 10,
            highPercent: 20,
            mediumPpd: 2,
            highPpd: 6
          }
        ),
        category: "Summary",
        subcategory: summary,
        section: pair.current.section ?? "Summary",
        subsection: pair.current.subsection,
        title: `${pair.current.period ?? pair.current.sheetName} ${summary} deteriorated from ${pair.previous.period ?? pair.previous.sheetName}`,
        explanation: `${summary} declined period over period by more than the deterministic deterioration threshold, so this is a structured margin-trend packet ready for later AI explanation.`,
        triggerReason: `${summary} declined period over period by more than the configured deterioration threshold.`,
        supportingMetrics: [
          metric(`${pair.previous.period ?? pair.previous.sheetName} actual`, pair.previous.actual, "currency"),
          metric(`${pair.current.period ?? pair.current.sheetName} actual`, pair.current.actual, "currency"),
          metric(`${pair.previous.period ?? pair.previous.sheetName} actual PPD`, pair.previous.actualPpd, "ppd"),
          metric(`${pair.current.period ?? pair.current.sheetName} actual PPD`, pair.current.actualPpd, "ppd"),
          metric("Period-over-period change", trendPercent, "percent")
        ],
        thresholdsExceeded: compactThresholds([
          negativeThreshold(
            `${summary} change %`,
            trendPercent,
            NET_INCOME_TREND_PERCENT_THRESHOLD,
            "percent"
          )
        ]),
        periodsInvolved: periods(
          pair.previous.period ?? pair.previous.sheetName,
          pair.current.period ?? pair.current.sheetName
        ),
        trendDirection: "deteriorating",
        period: pair.current.period,
        lineItem: pair.current.lineItem
      })
    }
  }

  return insights
}

function shouldSurfaceVariance(
  record: TopVarianceRecord,
  direction: "positive" | "negative"
): boolean {
  const absVariance = Math.abs(record.varianceAmount)
  const absPercent = Math.abs(record.percentChange ?? 0)

  if (absVariance < VARIANCE_AMOUNT_THRESHOLD && absPercent < VARIANCE_PERCENT_THRESHOLD) {
    return false
  }

  return direction === "positive"
    ? record.varianceAmount > 0
    : record.varianceAmount < 0
}

function shouldSurfaceExpenseIncrease(record: TopVarianceRecord): boolean {
  if (record.varianceAmount <= 0) return false
  return (
    record.varianceAmount >= EXPENSE_INCREASE_AMOUNT_THRESHOLD ||
    (record.percentChange ?? 0) >= EXPENSE_INCREASE_PERCENT_THRESHOLD
  )
}

function shouldSurfaceLaborSpike(record: NormalizedFinancialRecord): boolean {
  const variance = record.variance ?? calculateVariance(record.actual, record.budget)
  const percent = calculatePercentChange(record.actual, record.budget)
  const variancePpd = record.variancePpd ?? calculateVariance(record.actualPpd, record.budgetPpd)

  return (
    (variance ?? 0) >= LABOR_SPIKE_AMOUNT_THRESHOLD ||
    (percent ?? 0) >= LABOR_SPIKE_PERCENT_THRESHOLD ||
    (variancePpd ?? 0) >= LABOR_SPIKE_PPD_THRESHOLD
  )
}

function shouldSurfaceRevenueDecline(record: TopVarianceRecord): boolean {
  return (
    record.varianceAmount <= -REVENUE_DECLINE_AMOUNT_THRESHOLD ||
    (record.percentChange ?? 0) <= REVENUE_DECLINE_PERCENT_THRESHOLD
  )
}

function isComparableLaborTotal(record: NormalizedFinancialRecord): boolean {
  const lineItemKey = normalizeKey(record.lineItem)
  const subcategoryKey = normalizeKey(record.subcategory)
  return lineItemKey === subcategoryKey
}

function createVarianceInsight(
  record: TopVarianceRecord,
  type: InsightType,
  trendDirection: InsightTrendDirection,
  title: string,
  explanation: string
): OperationalInsight {
  return {
    type,
    severity: getSeverity(record.varianceAmount, record.percentChange, record.variancePpd, {
      mediumAmount: VARIANCE_AMOUNT_THRESHOLD,
      highAmount: 50000,
      mediumPercent: VARIANCE_PERCENT_THRESHOLD,
      highPercent: 25,
      mediumPpd: 5,
      highPpd: 25
    }),
    category: record.category,
    subcategory: record.subcategory,
    section: record.section,
    subsection: record.subsection,
    title,
    explanation,
    triggerReason: varianceTriggerReason(type),
    supportingMetrics: [
      metric("Actual", record.actual, "currency"),
      metric("Budget", record.budget, "currency"),
      metric("Variance", record.varianceAmount, "currency"),
      metric("Variance %", record.percentChange, "percent"),
      metric("Actual PPD", record.actualPpd, "ppd"),
      metric("Budget PPD", record.budgetPpd, "ppd"),
      metric("Variance PPD", record.variancePpd, "ppd")
    ],
    thresholdsExceeded: varianceThresholds(record, type),
    periodsInvolved: periods(record.period ?? record.sheetName),
    trendDirection,
    period: record.period,
    lineItem: record.lineItem
  }
}

function getLatestTrendPair(points: TrendDataPoint[]):
  | { previous: TrendDataPoint; current: TrendDataPoint }
  | null {
  if (points.length < 2) return null
  return {
    previous: points.at(-2)!,
    current: points.at(-1)!
  }
}

function getLatestRecordPair(records: NormalizedFinancialRecord[]):
  | { previous: NormalizedFinancialRecord; current: NormalizedFinancialRecord }
  | null {
  if (records.length < 2) return null
  return {
    previous: records.at(-2)!,
    current: records.at(-1)!
  }
}

function metric(
  label: string,
  value: number | string | null | undefined,
  unit?: InsightSupportingMetric["unit"]
): InsightSupportingMetric {
  return {
    label,
    value: value ?? null,
    unit
  }
}

function compactThresholds(
  thresholds: Array<InsightThreshold | null>
): InsightThreshold[] | undefined {
  const filtered = thresholds.filter(
    (threshold): threshold is InsightThreshold => threshold !== null
  )
  return filtered.length > 0 ? filtered : undefined
}

function positiveThreshold(
  label: string,
  actual: number | string | null | undefined,
  threshold: number,
  unit?: InsightSupportingMetric["unit"]
): InsightThreshold | null {
  if (typeof actual !== "number") return null
  if (actual < threshold) return null
  return {
    label,
    actual,
    threshold,
    comparator: ">=",
    unit
  }
}

function negativeThreshold(
  label: string,
  actual: number | string | null | undefined,
  threshold: number,
  unit?: InsightSupportingMetric["unit"]
): InsightThreshold | null {
  if (typeof actual !== "number") return null
  if (actual > threshold) return null
  return {
    label,
    actual,
    threshold,
    comparator: "<=",
    unit
  }
}

function absoluteThreshold(
  label: string,
  actual: number | string | null | undefined,
  threshold: number,
  unit?: InsightSupportingMetric["unit"]
): InsightThreshold | null {
  if (typeof actual !== "number") return null
  const absolute = Math.abs(actual)
  if (absolute < threshold) return null
  return {
    label,
    actual: absolute,
    threshold,
    comparator: ">=",
    unit
  }
}

function periods(...values: Array<string | undefined>): string[] | undefined {
  const list = values.filter((value): value is string => Boolean(value))
  return list.length > 0 ? [...new Set(list)] : undefined
}

function getSeverity(
  amount: number | null | undefined,
  percent: number | null | undefined,
  ppd: number | null | undefined,
  thresholds: {
    mediumAmount: number
    highAmount: number
    mediumPercent: number
    highPercent: number
    mediumPpd?: number
    highPpd?: number
  }
): InsightSeverity {
  const absAmount = Math.abs(amount ?? 0)
  const absPercent = Math.abs(percent ?? 0)
  const absPpd = Math.abs(ppd ?? 0)
  const highPpd = thresholds.highPpd ?? Number.POSITIVE_INFINITY
  const mediumPpd = thresholds.mediumPpd ?? Number.POSITIVE_INFINITY

  if (
    absAmount >= thresholds.highAmount ||
    absPercent >= thresholds.highPercent ||
    absPpd >= highPpd
  ) {
    return "high"
  }

  if (
    absAmount >= thresholds.mediumAmount ||
    absPercent >= thresholds.mediumPercent ||
    absPpd >= mediumPpd
  ) {
    return "medium"
  }

  return "low"
}

function varianceTriggerReason(type: InsightType): string {
  if (type === "negative_variance") {
    return "The line item breached the negative variance threshold in dollars, percent, or both."
  }
  if (type === "positive_variance") {
    return "The line item exceeded the positive variance threshold in dollars, percent, or both."
  }
  if (type === "abnormal_expense_increase") {
    return "The expense line item rose above the abnormal increase threshold in dollars, percent, or both."
  }
  if (type === "revenue_decline") {
    return "The revenue line item fell below the revenue-decline threshold in dollars, percent, or both."
  }
  return "The line item exceeded the deterministic variance threshold."
}

function varianceThresholds(
  record: TopVarianceRecord,
  type: InsightType
): InsightThreshold[] | undefined {
  if (type === "positive_variance") {
    return compactThresholds([
      positiveThreshold("Variance", record.varianceAmount, VARIANCE_AMOUNT_THRESHOLD, "currency"),
      positiveThreshold("Variance %", record.percentChange, VARIANCE_PERCENT_THRESHOLD, "percent")
    ])
  }

  if (type === "negative_variance") {
    return compactThresholds([
      negativeThreshold("Variance", record.varianceAmount, -VARIANCE_AMOUNT_THRESHOLD, "currency"),
      negativeThreshold("Variance %", record.percentChange, -VARIANCE_PERCENT_THRESHOLD, "percent")
    ])
  }

  if (type === "abnormal_expense_increase") {
    return compactThresholds([
      positiveThreshold(
        "Expense variance",
        record.varianceAmount,
        EXPENSE_INCREASE_AMOUNT_THRESHOLD,
        "currency"
      ),
      positiveThreshold(
        "Expense variance %",
        record.percentChange,
        EXPENSE_INCREASE_PERCENT_THRESHOLD,
        "percent"
      )
    ])
  }

  if (type === "revenue_decline") {
    return compactThresholds([
      negativeThreshold(
        "Revenue variance",
        record.varianceAmount,
        -REVENUE_DECLINE_AMOUNT_THRESHOLD,
        "currency"
      ),
      negativeThreshold(
        "Revenue variance %",
        record.percentChange,
        REVENUE_DECLINE_PERCENT_THRESHOLD,
        "percent"
      )
    ])
  }

  return undefined
}

function insightLabel(record: Pick<NormalizedFinancialRecord, "lineItem" | "subcategory">): string {
  return record.lineItem.trim() || record.subcategory || "line item"
}

function insightDirectionFromVariance(
  value: number | null | undefined
): InsightTrendDirection {
  if (value === null || value === undefined || value === 0) return "stable"
  return value > 0 ? "improving" : "deteriorating"
}

function ratioToPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return value * 100
}

function dedupeInsights(insights: OperationalInsight[]): OperationalInsight[] {
  const seen = new Set<string>()
  const deduped: OperationalInsight[] = []

  for (const insight of insights) {
    const key = [
      insight.type,
      insight.period ?? "",
      normalizeKey(insight.category),
      normalizeKey(insight.subcategory),
      normalizeKey(insight.lineItem),
      normalizeKey(insight.title)
    ].join("|")

    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(insight)
  }

  return deduped
}

function compareInsights(left: OperationalInsight, right: OperationalInsight): number {
  const severityRank = { high: 3, medium: 2, low: 1 }
  const severityDiff = severityRank[right.severity] - severityRank[left.severity]
  if (severityDiff !== 0) return severityDiff

  const magnitudeDiff = getInsightMagnitude(right) - getInsightMagnitude(left)
  if (magnitudeDiff !== 0) return magnitudeDiff

  const periodDiff = sortPeriods(left.period ?? "", right.period ?? "")
  if (periodDiff !== 0) return periodDiff

  return left.title.localeCompare(right.title)
}

function getInsightMagnitude(insight: OperationalInsight): number {
  return insight.supportingMetrics.reduce((max, metricValue) => {
    if (typeof metricValue.value !== "number") return max
    return Math.max(max, Math.abs(metricValue.value))
  }, 0)
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]

  const position = (values.length - 1) * percentileValue
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = values[lowerIndex]
  const upper = values[upperIndex]

  if (lowerIndex === upperIndex) return lower

  return lower + (upper - lower) * (position - lowerIndex)
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

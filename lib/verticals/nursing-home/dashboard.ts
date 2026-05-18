import { and, desc, eq, inArray } from "drizzle-orm"
import {
  db,
  facility,
  insightPacket,
  narrative,
  normalizedFinancialRecord as normalizedFinancialRecordTable,
  reportingPeriod,
  upload
} from "@/lib/db"
import { calculatePercentChange, calculateVariance } from "./metricCalculations"
import type {
  InsightSeverity,
  InsightSupportingMetric,
  InsightThreshold,
  InsightTrendDirection
} from "./types"
import type {
  UploadDiagnostic,
  ValidationStats
} from "./pipeline"

export type FacilitySnapshotSummary = {
  uploadId: string
  reportingPeriodId: string
  label: string
  periodKey: string
  monthStart: string | null
  sourcePeriodLabel: string | null
  status: string
  integrityScore: number | null
  uploadedAt: Date
  validationStats: ValidationStats | null
  processingErrors: UploadDiagnostic[] | null
  diagnostics: {
    sheetNotes: Array<{ sheetName: string; notes: string[]; issueCount: number }>
    warnings: UploadDiagnostic[]
  } | null
}

export type PersistedInsightView = {
  id: string
  insightKey: string
  type: string
  severity: InsightSeverity
  category: string | null
  subcategory: string | null
  section: string | null
  subsection: string | null
  lineItem: string | null
  period: string | null
  title: string
  explanation: string
  triggerReason: string | null
  trendDirection: InsightTrendDirection
  supportingMetrics: InsightSupportingMetric[]
  thresholdsExceeded: InsightThreshold[]
  periodsInvolved: string[]
}

export type PersistedNarrativeView = {
  id: string
  audience: string
  status: string
  model: string | null
  narrativeText: string | null
  errorMessage: string | null
  supportingInsightIds: string[]
}

export type DashboardTrendPoint = {
  label: string
  actual: number | null
  budget: number | null
  variance: number | null
  percentChange: number | null
}

export type FacilityDashboardData = {
  facility: {
    id: string
    name: string
  }
  selectedSnapshot: FacilitySnapshotSummary | null
  snapshots: FacilitySnapshotSummary[]
  criticalInsights: PersistedInsightView[]
  operationalRisks: PersistedInsightView[]
  narratives: PersistedNarrativeView[]
  trends: {
    revenue: DashboardTrendPoint[]
    labor: DashboardTrendPoint[]
    margin: DashboardTrendPoint[]
    expenses: DashboardTrendPoint[]
  }
}

type HistoricalRecord = {
  uploadId: string
  reportingPeriodLabel: string
  sourcePeriodLabel: string | null
  monthStart: string | null
  category: string | null
  subcategory: string | null
  period: string | null
  rowNumber: number
  actual: number | null
  budget: number | null
  isTotal: boolean
  isHidden: boolean
}

export async function loadFacilityDashboardData(args: {
  userId: string
  facilityId: string
  uploadId?: string | null
}): Promise<FacilityDashboardData | null> {
  const [facilityRow] = await db
    .select({
      id: facility.id,
      name: facility.name
    })
    .from(facility)
    .where(and(eq(facility.id, args.facilityId), eq(facility.userId, args.userId)))
    .limit(1)

  if (!facilityRow) return null

  const snapshotRows = await db
    .select({
      uploadId: upload.id,
      reportingPeriodId: reportingPeriod.id,
      label: reportingPeriod.label,
      periodKey: reportingPeriod.periodKey,
      monthStart: reportingPeriod.monthStart,
      sourcePeriodLabel: reportingPeriod.sourcePeriodLabel,
      status: upload.status,
      integrityScore: upload.integrityScore,
      uploadedAt: upload.createdAt,
      validationStats: upload.validationStats,
      processingErrors: upload.processingErrors,
      diagnostics: upload.diagnostics
    })
    .from(upload)
    .innerJoin(reportingPeriod, eq(reportingPeriod.uploadId, upload.id))
    .where(and(eq(upload.facilityId, args.facilityId), eq(upload.userId, args.userId)))
    .orderBy(desc(reportingPeriod.monthStart), desc(upload.createdAt))

  const snapshots = snapshotRows.map((row) => ({
    uploadId: row.uploadId,
    reportingPeriodId: row.reportingPeriodId,
    label: row.label,
    periodKey: row.periodKey,
    monthStart: row.monthStart,
    sourcePeriodLabel: row.sourcePeriodLabel,
    status: row.status,
      integrityScore: row.integrityScore,
      uploadedAt: row.uploadedAt,
      validationStats: (row.validationStats as ValidationStats | null) ?? null,
      processingErrors: (row.processingErrors as UploadDiagnostic[] | null) ?? null,
      diagnostics: (row.diagnostics as FacilitySnapshotSummary["diagnostics"]) ?? null
    }))

  const selectedSnapshot =
    snapshots.find((snapshot) => snapshot.uploadId === args.uploadId) ??
    snapshots[0] ??
    null

  if (!selectedSnapshot) {
    return {
      facility: facilityRow,
      selectedSnapshot: null,
      snapshots: [],
      criticalInsights: [],
      operationalRisks: [],
      narratives: [],
      trends: {
        revenue: [],
        labor: [],
        margin: [],
        expenses: []
      }
    }
  }

  const recentSnapshots = snapshots.slice(0, 6)
  const recentUploadIds = recentSnapshots.map((snapshot) => snapshot.uploadId)

  const historicalRecordsRaw = await db
    .select({
      uploadId: normalizedFinancialRecordTable.uploadId,
      reportingPeriodLabel: reportingPeriod.label,
      sourcePeriodLabel: reportingPeriod.sourcePeriodLabel,
      monthStart: reportingPeriod.monthStart,
      category: normalizedFinancialRecordTable.category,
      subcategory: normalizedFinancialRecordTable.subcategory,
      period: normalizedFinancialRecordTable.period,
      rowNumber: normalizedFinancialRecordTable.rowNumber,
      actual: normalizedFinancialRecordTable.actual,
      budget: normalizedFinancialRecordTable.budget,
      isTotal: normalizedFinancialRecordTable.isTotal,
      isHidden: normalizedFinancialRecordTable.isHidden
    })
    .from(normalizedFinancialRecordTable)
    .innerJoin(
      reportingPeriod,
      eq(normalizedFinancialRecordTable.reportingPeriodId, reportingPeriod.id)
    )
    .where(inArray(normalizedFinancialRecordTable.uploadId, recentUploadIds))

  const historicalRecords = historicalRecordsRaw.map((record) => ({
    ...record,
    monthStart: record.monthStart ?? null
  }))

  const currentInsightsRaw = await db
    .select({
      id: insightPacket.id,
      insightKey: insightPacket.insightKey,
      type: insightPacket.type,
      severity: insightPacket.severity,
      category: insightPacket.category,
      subcategory: insightPacket.subcategory,
      section: insightPacket.section,
      subsection: insightPacket.subsection,
      lineItem: insightPacket.lineItem,
      period: insightPacket.period,
      title: insightPacket.title,
      explanation: insightPacket.explanation,
      triggerReason: insightPacket.triggerReason,
      trendDirection: insightPacket.trendDirection,
      supportingMetrics: insightPacket.supportingMetrics,
      thresholdsExceeded: insightPacket.thresholdsExceeded,
      periodsInvolved: insightPacket.periodsInvolved
    })
    .from(insightPacket)
    .where(eq(insightPacket.uploadId, selectedSnapshot.uploadId))

  const currentInsights = currentInsightsRaw
    .map((row) => ({
      id: row.id,
      insightKey: row.insightKey,
      type: row.type,
      severity: row.severity as InsightSeverity,
      category: row.category,
      subcategory: row.subcategory,
      section: row.section,
      subsection: row.subsection,
      lineItem: row.lineItem,
      period: row.period,
      title: row.title,
      explanation: row.explanation,
      triggerReason: row.triggerReason,
      trendDirection: row.trendDirection as InsightTrendDirection,
      supportingMetrics:
        (row.supportingMetrics as InsightSupportingMetric[] | null) ?? [],
      thresholdsExceeded:
        (row.thresholdsExceeded as InsightThreshold[] | null) ?? [],
      periodsInvolved: (row.periodsInvolved as string[] | null) ?? []
    }))
    .sort(compareInsights)

  const currentNarrativesRaw = await db
    .select({
      id: narrative.id,
      audience: narrative.audience,
      status: narrative.status,
      model: narrative.model,
      narrativeText: narrative.narrativeText,
      errorMessage: narrative.errorMessage,
      supportingInsightIds: narrative.supportingInsightIds
    })
    .from(narrative)
    .where(eq(narrative.uploadId, selectedSnapshot.uploadId))

  const narratives = currentNarrativesRaw
    .map((row) => ({
      id: row.id,
      audience: row.audience,
      status: row.status,
      model: row.model,
      narrativeText: row.narrativeText,
      errorMessage: row.errorMessage,
      supportingInsightIds: (row.supportingInsightIds as string[] | null) ?? []
    }))
    .sort((left, right) => narrativeOrder(left.audience) - narrativeOrder(right.audience))

  return {
    facility: facilityRow,
    selectedSnapshot,
    snapshots,
    criticalInsights: currentInsights,
    operationalRisks: currentInsights.filter((insight) =>
      [
        "census_decline",
        "labor_spike",
        "abnormal_expense_increase",
        "margin_compression",
        "trend_deterioration"
      ].includes(insight.type)
    ),
    narratives,
    trends: {
      revenue: buildHistoricalSeries(historicalRecords, recentSnapshots, {
        category: "Revenue"
      }),
      labor: buildHistoricalSeries(historicalRecords, recentSnapshots, {
        category: "Labor"
      }),
      margin: buildHistoricalSeries(historicalRecords, recentSnapshots, {
        category: "Summary",
        subcategory: "Net Income",
        fallbackSubcategory: "EBITDARM",
        useSummaryRow: true
      }),
      expenses: buildHistoricalSeries(historicalRecords, recentSnapshots, {
        category: "Operating Expenses"
      })
    }
  }
}

function buildHistoricalSeries(
  records: HistoricalRecord[],
  snapshots: FacilitySnapshotSummary[],
  filter: {
    category: string
    subcategory?: string
    fallbackSubcategory?: string
    useSummaryRow?: boolean
  }
): DashboardTrendPoint[] {
  return [...snapshots]
    .reverse()
    .map((snapshot) => {
      const scoped = records.filter((record) => {
        if (record.uploadId !== snapshot.uploadId) return false
        if (record.isHidden) return false
        if (
          snapshot.sourcePeriodLabel &&
          record.period &&
          normalizeKey(record.period) !== normalizeKey(snapshot.sourcePeriodLabel)
        ) {
          return false
        }

        return true
      })

      if (filter.useSummaryRow) {
        const primary = pickSummaryRow(scoped, filter.category, filter.subcategory)
        const fallback = filter.fallbackSubcategory
          ? pickSummaryRow(scoped, filter.category, filter.fallbackSubcategory)
          : null
        const row = primary ?? fallback
        return {
          label: snapshot.label,
          actual: row?.actual ?? null,
          budget: row?.budget ?? null,
          variance: calculateVariance(row?.actual, row?.budget),
          percentChange: calculatePercentChange(row?.actual, row?.budget)
        }
      }

      const relevant = scoped.filter((record) => {
        if (record.isTotal) return false
        return normalizeKey(record.category ?? "") === normalizeKey(filter.category)
      })

      const actual = sumValues(relevant.map((record) => record.actual))
      const budget = sumValues(relevant.map((record) => record.budget))

      return {
        label: snapshot.label,
        actual,
        budget,
        variance: calculateVariance(actual, budget),
        percentChange: calculatePercentChange(actual, budget)
      }
    })
    .filter(
      (point) =>
        point.actual !== null ||
        point.budget !== null ||
        point.variance !== null
    )
}

function pickSummaryRow(
  records: HistoricalRecord[],
  category: string,
  subcategory?: string
): HistoricalRecord | null {
  const matching = records
    .filter((record) => normalizeKey(record.category ?? "") === normalizeKey(category))
    .filter((record) =>
      subcategory
        ? normalizeKey(record.subcategory ?? "") === normalizeKey(subcategory)
        : true
    )
    .sort((left, right) => right.rowNumber - left.rowNumber)

  return matching[0] ?? null
}

function sumValues(values: Array<number | null>): number | null {
  let total: number | null = null
  for (const value of values) {
    if (value === null || value === undefined) continue
    total = (total ?? 0) + value
  }
  return total
}

function compareInsights(left: PersistedInsightView, right: PersistedInsightView): number {
  const severityRank = { high: 3, medium: 2, low: 1 }
  const severityDiff = severityRank[right.severity] - severityRank[left.severity]
  if (severityDiff !== 0) return severityDiff

  return left.title.localeCompare(right.title)
}

function narrativeOrder(audience: string): number {
  if (audience === "administrator") return 1
  if (audience === "finance") return 2
  if (audience === "operations") return 3
  if (audience === "daily") return 4
  return 99
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[/%(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

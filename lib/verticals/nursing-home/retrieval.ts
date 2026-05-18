import type {
  NormalizedFinancialRecord,
  RecordFilter,
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

export function getRecordsByCategory(
  records: NormalizedFinancialRecord[],
  category: string,
  options: Omit<RecordFilter, "category"> = {}
): NormalizedFinancialRecord[] {
  return filterRecords(records, { ...options, category })
}

export function getRecordsBySection(
  records: NormalizedFinancialRecord[],
  section: string,
  options: Omit<RecordFilter, "section"> = {}
): NormalizedFinancialRecord[] {
  return filterRecords(records, { ...options, section })
}

export function getTopVariances(
  records: NormalizedFinancialRecord[],
  options: RecordFilter & {
    direction?: "positive" | "negative"
    limit?: number
    metric?: "variance" | "variancePpd"
  } = {}
): TopVarianceRecord[] {
  const {
    direction = "negative",
    limit = 10,
    metric = "variance",
    includeHidden = false,
    includeTotals = false,
    metricsOnly = true,
    ...filters
  } = options

  const candidates = filterRecords(records, {
    ...filters,
    includeHidden,
    includeTotals,
    metricsOnly
  })
    .map((record) => {
      const varianceAmount =
        metric === "variance"
          ? resolveVariance(record.actual, record.budget, record.variance)
          : resolveVariance(record.actualPpd, record.budgetPpd, record.variancePpd)

      if (varianceAmount === null || varianceAmount === 0) return null

      return {
        ...record,
        varianceAmount,
        percentChange: calculatePercentChangeForRecord(record)
      }
    })
    .filter((record): record is TopVarianceRecord => record !== null)

  candidates.sort((left, right) =>
    direction === "positive"
      ? right.varianceAmount - left.varianceAmount
      : left.varianceAmount - right.varianceAmount
  )

  return candidates.slice(0, limit)
}

export function getTrendData(
  records: NormalizedFinancialRecord[],
  options: RecordFilter = {}
): TrendDataPoint[] {
  const filtered = filterRecords(records, {
    includeTotals: false,
    metricsOnly: true,
    ...options
  })

  const byPeriod = new Map<
    string,
    {
      actual: number | null
      budget: number | null
      actualPpd: number | null
      budgetPpd: number | null
      recordCount: number
    }
  >()

  for (const record of filtered) {
    const period = record.period ?? record.sheetName
    const current = byPeriod.get(period) ?? {
      actual: null,
      budget: null,
      actualPpd: null,
      budgetPpd: null,
      recordCount: 0
    }

    current.actual = addNullable(current.actual, record.actual)
    current.budget = addNullable(current.budget, record.budget)
    current.actualPpd = addNullable(current.actualPpd, record.actualPpd)
    current.budgetPpd = addNullable(current.budgetPpd, record.budgetPpd)
    current.recordCount += 1

    byPeriod.set(period, current)
  }

  return [...byPeriod.entries()]
    .map(([period, value]) => ({
      period,
      actual: value.actual,
      budget: value.budget,
      variance: resolveVariance(value.actual, value.budget, null),
      actualPpd: value.actualPpd,
      budgetPpd: value.budgetPpd,
      variancePpd: resolveVariance(value.actualPpd, value.budgetPpd, null),
      recordCount: value.recordCount
    }))
    .sort((left, right) => sortPeriods(left.period, right.period))
}

function filterRecords(
  records: NormalizedFinancialRecord[],
  filter: RecordFilter
): NormalizedFinancialRecord[] {
  const includeHidden = filter.includeHidden ?? true
  const includeTotals = filter.includeTotals ?? true
  const metricsOnly = filter.metricsOnly ?? false

  return records.filter((record) => {
    if (!includeHidden && record.isHidden) return false
    if (!includeTotals && record.isTotal) return false
    if (metricsOnly && !hasMetrics(record)) return false

    if (!matchesValue(record.category, filter.category)) return false
    if (!matchesValue(record.subcategory, filter.subcategory)) return false
    if (!matchesValue(record.section, filter.section)) return false
    if (!matchesValue(record.subsection, filter.subsection)) return false
    if (!matchesValue(record.lineItem, filter.lineItem)) return false
    if (!matchesValue(record.period, filter.period)) return false
    if (!matchesValue(record.reportType, filter.reportType)) return false

    return true
  })
}

function hasMetrics(record: NormalizedFinancialRecord): boolean {
  return (
    record.actual !== null &&
    record.actual !== undefined ||
    record.budget !== null &&
    record.budget !== undefined ||
    record.variance !== null &&
    record.variance !== undefined ||
    record.actualPpd !== null &&
    record.actualPpd !== undefined ||
    record.budgetPpd !== null &&
    record.budgetPpd !== undefined ||
    record.variancePpd !== null &&
    record.variancePpd !== undefined
  )
}

function matchesValue(value: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true
  return normalizeKey(value) === normalizeKey(expected)
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

function sortPeriods(left: string, right: string): number {
  const leftIndex = MONTH_ORDER.get(normalizeKey(left)) ?? Number.MAX_SAFE_INTEGER
  const rightIndex = MONTH_ORDER.get(normalizeKey(right)) ?? Number.MAX_SAFE_INTEGER
  if (leftIndex !== rightIndex) return leftIndex - rightIndex
  return left.localeCompare(right)
}

function resolveVariance(
  actual: number | null | undefined,
  budget: number | null | undefined,
  fallback: number | null | undefined
): number | null {
  if (actual === null && budget === null) return fallback ?? null
  if (actual === undefined && budget === undefined) return fallback ?? null
  return (actual ?? 0) - (budget ?? 0)
}

function calculatePercentChangeForRecord(
  record: NormalizedFinancialRecord
): number | null {
  if (record.actual === null || record.actual === undefined) return null
  if (record.budget === null || record.budget === undefined) return null
  if (record.budget === 0) return record.actual === 0 ? 0 : null
  return ((record.actual - record.budget) / record.budget) * 100
}

function addNullable(
  current: number | null,
  next: number | null | undefined
): number | null {
  if (next === null || next === undefined) return current
  return (current ?? 0) + next
}

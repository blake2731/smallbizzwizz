import type {
  ExpenseMetrics,
  LaborMetrics,
  MetricSummary,
  NormalizedFinancialRecord,
  RevenueMetrics,
  TopVarianceRecord
} from "./types"

export function calculateVariance(
  actual: number | null | undefined,
  budget: number | null | undefined
): number | null {
  if (actual === null && budget === null) return null
  if (actual === undefined && budget === undefined) return null
  return (actual ?? 0) - (budget ?? 0)
}

export function calculatePercentChange(
  actual: number | null | undefined,
  baseline: number | null | undefined
): number | null {
  if (actual === null || actual === undefined) return null
  if (baseline === null || baseline === undefined) return null
  if (baseline === 0) return actual === 0 ? 0 : null
  return ((actual - baseline) / baseline) * 100
}

export function getLargestNegativeVariances(
  records: NormalizedFinancialRecord[],
  limit = 10
): TopVarianceRecord[] {
  return buildVarianceRecords(records, "negative", limit)
}

export function getLargestPositiveVariances(
  records: NormalizedFinancialRecord[],
  limit = 10
): TopVarianceRecord[] {
  return buildVarianceRecords(records, "positive", limit)
}

export function getLaborMetrics(
  records: NormalizedFinancialRecord[]
): LaborMetrics {
  const laborRecords = leafRecords(records).filter(
    (record) => record.category === "Labor"
  )

  return {
    total: summarizeRecords("Total Labor", laborRecords),
    wages: summarizeRecords(
      "Wages",
      laborRecords.filter((record) => record.subcategory === "Wages")
    ),
    payrollTaxes: summarizeRecords(
      "Payroll Taxes",
      laborRecords.filter((record) => record.subcategory === "Payroll Taxes")
    ),
    employeeBenefits: summarizeRecords(
      "Employee Benefits",
      laborRecords.filter((record) => record.subcategory === "Employee Benefits")
    ),
    agencyStaffing: summarizeRecords(
      "Agency Staffing",
      laborRecords.filter((record) => record.subcategory === "Agency Staffing")
    )
  }
}

export function getRevenueMetrics(
  records: NormalizedFinancialRecord[]
): RevenueMetrics {
  const revenueRecords = leafRecords(records).filter(
    (record) => record.category === "Revenue"
  )

  return {
    total: summarizeRecords("Total Revenue", revenueRecords),
    medicarePartA: summarizeRecords(
      "Medicare Part A",
      revenueRecords.filter((record) => record.subcategory === "Medicare Part A")
    ),
    medicaid: summarizeRecords(
      "Medicaid",
      revenueRecords.filter((record) =>
        ["Medicaid", "Medicaid HMO", "Medicaid Pending"].includes(
          record.subcategory ?? ""
        )
      )
    ),
    privatePay: summarizeRecords(
      "Private Pay",
      revenueRecords.filter((record) => record.subcategory === "Private Pay")
    ),
    therapy: summarizeRecords(
      "Therapy",
      revenueRecords.filter((record) => record.subcategory === "Therapy")
    )
  }
}

export function getExpenseMetrics(
  records: NormalizedFinancialRecord[]
): ExpenseMetrics {
  const expenseRecords = leafRecords(records).filter(
    (record) =>
      record.category === "Operating Expenses" || record.category === "Labor"
  )
  const nonLaborExpenseRecords = expenseRecords.filter(
    (record) => record.category === "Operating Expenses"
  )

  return {
    total: summarizeRecords("Total Operating Expenses", expenseRecords),
    dietary: summarizeRecords(
      "Dietary",
      expenseRecords.filter((record) => record.subcategory === "Dietary")
    ),
    therapy: summarizeRecords(
      "Therapy",
      expenseRecords.filter((record) => record.subcategory === "Therapy")
    ),
    utilities: summarizeRecords(
      "Utilities",
      expenseRecords.filter((record) => record.subcategory === "Utilities")
    ),
    otherOperating: summarizeRecords(
      "Other Operating",
      nonLaborExpenseRecords.filter(
        (record) =>
          !["Dietary", "Therapy", "Utilities"].includes(record.subcategory ?? "")
      )
    )
  }
}

function buildVarianceRecords(
  records: NormalizedFinancialRecord[],
  direction: "positive" | "negative",
  limit: number
): TopVarianceRecord[] {
  const candidates = leafRecords(records, false)
    .filter((record) => record.category !== "Summary")
    .map((record) => {
      const varianceAmount = calculateVariance(record.actual, record.budget)
      if (varianceAmount === null || varianceAmount === 0) return null

      return {
        ...record,
        varianceAmount,
        percentChange: calculatePercentChange(record.actual, record.budget)
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

function summarizeRecords(
  label: string,
  records: NormalizedFinancialRecord[]
): MetricSummary {
  const actual = sumMetric(records, "actual")
  const budget = sumMetric(records, "budget")
  const actualPpd = sumMetric(records, "actualPpd")
  const budgetPpd = sumMetric(records, "budgetPpd")

  return {
    label,
    actual,
    budget,
    variance: calculateVariance(actual, budget),
    actualPpd,
    budgetPpd,
    variancePpd: calculateVariance(actualPpd, budgetPpd),
    percentChange: calculatePercentChange(actual, budget),
    recordCount: records.length
  }
}

function leafRecords(
  records: NormalizedFinancialRecord[],
  includeHidden = true
): NormalizedFinancialRecord[] {
  return records.filter((record) => {
    if (record.isTotal) return false
    if (!includeHidden && record.isHidden) return false
    return hasMetrics(record)
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

function sumMetric(
  records: NormalizedFinancialRecord[],
  field: keyof Pick<
    NormalizedFinancialRecord,
    "actual" | "budget" | "actualPpd" | "budgetPpd"
  >
): number | null {
  let total: number | null = null

  for (const record of records) {
    const value = record[field]
    if (value === null || value === undefined) continue
    total = (total ?? 0) + value
  }

  return total
}

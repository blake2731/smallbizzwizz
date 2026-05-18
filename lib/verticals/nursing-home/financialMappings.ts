import type { FinancialRecord, SheetParse } from "@/lib/parsers/cypress"
import type { NormalizedFinancialRecord } from "./types"

const MONTH_NAMES = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
])

const LABOR_WAGE_COMPONENTS = new Set([
  "wages",
  "regular",
  "overtime",
  "shift differential",
  "bonus",
  "incentive bonus",
  "pto",
  "holiday"
])

const AGENCY_STAFFING_COMPONENTS = new Set([
  "agency staffing",
  "contract labor",
  "registry",
  "registry labor",
  "temporary staffing",
  "travel nurses",
  "travel nursing"
])

const LABOR_ROLE_LABELS = new Set([
  "activities director",
  "activities staff",
  "administrator",
  "admissions staff",
  "alf il cna",
  "alf il director",
  "alf il staff",
  "assistant adminsitrator",
  "assistant administrator",
  "assistant director of nursing",
  "business office manager",
  "central supply medical records",
  "cna",
  "dietary aide",
  "dietary cook",
  "dietary manager",
  "director of nursing",
  "director of rehab",
  "director supervisor",
  "floor tech",
  "hospital liaison",
  "housekeeping staff",
  "human resources",
  "intake coordinator",
  "laundry staff",
  "lpn",
  "lpn supervisor",
  "lpn unit manager",
  "lpn wound care",
  "maintenance director",
  "maintenance staff",
  "mds rnac lpnac",
  "occupational therapist",
  "occupational therapist assistant",
  "physical therapist",
  "physical therapist assistant",
  "porter",
  "quality assurance infection control",
  "receptionist admin assistant",
  "regional director of central admissions",
  "regional director of clinical operations",
  "respiratory manager",
  "respiratory therapist",
  "rn",
  "rn supervisor",
  "rn unit manager",
  "rn wound care",
  "scheduler staffing coordinator",
  "social services staff social worker",
  "social work director",
  "speech therapist slp",
  "vent cna",
  "vent lpn",
  "vent rn"
])

export function normalizeFinancialRecord(
  record: FinancialRecord
): NormalizedFinancialRecord {
  const sheetName = record.sheetName.trim()
  const section = cleanOptional(record.section)
  const subsection = cleanOptional(record.subsection)
  const lineItem = record.lineItem.trim()

  const sectionKey = normalizeKey(section)
  const subsectionKey = normalizeKey(subsection)
  const lineItemKey = normalizeKey(lineItem)
  const contextKey = [section, subsection, lineItem]
    .map((value) => normalizeKey(value))
    .filter(Boolean)
    .join(" ")

  const { category, subcategory } = classifyRecord({
    section,
    subsection,
    lineItem,
    sectionKey,
    subsectionKey,
    lineItemKey,
    contextKey
  })

  return {
    sheetName,
    rowNumber: record.rowNumber,
    section: section ?? undefined,
    subsection: subsection ?? undefined,
    category,
    subcategory,
    lineItem,
    period: inferPeriod(sheetName),
    reportType: inferReportType(sheetName),
    actual: record.actual,
    budget: record.budget,
    variance: record.variance ?? calculateDifference(record.actual, record.budget),
    actualPpd: record.actualPpd,
    budgetPpd: record.budgetPpd,
    variancePpd:
      record.variancePpd ?? calculateDifference(record.actualPpd, record.budgetPpd),
    isTotal: record.isTotal,
    isHidden: record.isHidden
  }
}

export function normalizeFinancialRecords(
  records: FinancialRecord[]
): NormalizedFinancialRecord[] {
  return records.map((record) => normalizeFinancialRecord(record))
}

export function normalizeSheetRecords(
  sheet: Pick<SheetParse, "records">
): NormalizedFinancialRecord[] {
  return normalizeFinancialRecords(sheet.records)
}

export function normalizeWorkbookRecords(
  sheets: Pick<SheetParse, "records">[]
): NormalizedFinancialRecord[] {
  return sheets.flatMap((sheet) => normalizeSheetRecords(sheet))
}

function classifyRecord(ctx: {
  section: string | null
  subsection: string | null
  lineItem: string
  sectionKey: string
  subsectionKey: string
  lineItemKey: string
  contextKey: string
}): Pick<NormalizedFinancialRecord, "category" | "subcategory"> {
  const summary = classifySummary(ctx.lineItemKey)
  if (summary) {
    return { category: "Summary", subcategory: summary }
  }

  if (isCensusContext(ctx)) {
    return {
      category: "Census",
      subcategory: classifyCensusLabel(ctx)
    }
  }

  if (isRevenueContext(ctx)) {
    return {
      category: "Revenue",
      subcategory: classifyRevenueLabel(ctx)
    }
  }

  if (isLaborContext(ctx)) {
    return {
      category: "Labor",
      subcategory: classifyLaborLabel(ctx)
    }
  }

  if (isExpenseContext(ctx)) {
    return {
      category: "Operating Expenses",
      subcategory: classifyExpenseLabel(ctx)
    }
  }

  if (ctx.lineItemKey.includes("revenue")) {
    return { category: "Revenue", subcategory: cleanLabel(ctx.lineItem) }
  }

  if (ctx.lineItemKey.includes("expense")) {
    return { category: "Operating Expenses", subcategory: cleanLabel(ctx.lineItem) }
  }

  return {
    category: cleanOptional(ctx.section) ?? undefined,
    subcategory: cleanOptional(ctx.subsection) ?? cleanLabel(ctx.lineItem)
  }
}

function classifySummary(lineItemKey: string): string | undefined {
  if (lineItemKey === "ebitdarm") return "EBITDARM"
  if (lineItemKey === "net income") return "Net Income"
  return undefined
}

function isCensusContext(ctx: {
  sectionKey: string
  subsectionKey: string
  lineItemKey: string
  contextKey: string
}): boolean {
  return (
    ctx.sectionKey.includes("census") ||
    ctx.subsectionKey.includes("census") ||
    ctx.lineItemKey.includes("census") ||
    ctx.lineItemKey === "occupancy" ||
    ctx.lineItemKey === "skilled" ||
    ctx.contextKey.includes("bed days")
  )
}

function isRevenueContext(ctx: {
  sectionKey: string
  subsectionKey: string
  lineItemKey: string
  contextKey: string
}): boolean {
  return (
    ctx.sectionKey === "revenue" ||
    ctx.subsectionKey.includes("revenue") ||
    ctx.lineItemKey.includes("revenue") ||
    ctx.contextKey.includes("room and board") ||
    ctx.contextKey.includes("ancillary revenue") ||
    ctx.contextKey.includes("vent revenue")
  )
}

function isExpenseContext(ctx: {
  sectionKey: string
  lineItemKey: string
}): boolean {
  return ctx.sectionKey === "operating expenses" || ctx.lineItemKey.includes("expense")
}

function isLaborContext(ctx: {
  sectionKey: string
  lineItemKey: string
  contextKey: string
}): boolean {
  if (ctx.sectionKey !== "operating expenses") return false

  if (LABOR_WAGE_COMPONENTS.has(ctx.lineItemKey)) return true
  if (AGENCY_STAFFING_COMPONENTS.has(ctx.lineItemKey)) return true
  if (LABOR_ROLE_LABELS.has(ctx.lineItemKey)) return true
  if (ctx.lineItemKey === "payroll taxes") return true
  if (ctx.lineItemKey === "employee benefits") return true
  if (ctx.lineItemKey === "personnel expenses") return true
  if (ctx.contextKey.includes("agency staffing")) return true
  if (ctx.contextKey.includes("contract labor")) return true
  if (ctx.contextKey.includes("registry")) return true

  return false
}

function classifyCensusLabel(ctx: {
  lineItem: string
  lineItemKey: string
  subsectionKey: string
  contextKey: string
}): string {
  const payer = classifyPayer(ctx.contextKey)
  if (payersAreComparable(payer)) return payer
  if (ctx.lineItemKey === "occupancy") return "Occupancy %"
  if (ctx.lineItemKey === "skilled") return "Skilled %"
  if (ctx.lineItemKey === "total census") return "Total Census"
  if (ctx.subsectionKey.includes("prior period")) return "Prior Period Census"
  if (ctx.subsectionKey.includes("current period")) return "Current Period Census"
  return cleanLabel(ctx.lineItem)
}

function classifyRevenueLabel(ctx: {
  subsection: string | null
  lineItem: string
  lineItemKey: string
  subsectionKey: string
  contextKey: string
}): string {
  const payer = classifyPayer(ctx.contextKey)
  if (payersAreComparable(payer)) return payer

  if (containsAny(ctx.contextKey, ["speech therapy", "physical therapy", "therapy"])) {
    return "Therapy"
  }
  if (ctx.contextKey.includes("pharmacy")) return "Pharmacy"
  if (ctx.contextKey.includes("lab")) return "Lab"
  if (ctx.contextKey.includes("radiology")) return "Radiology"
  if (ctx.contextKey.includes("room and board")) return "Room & Board Revenue"
  if (ctx.contextKey.includes("ancillary revenue")) return "Ancillary Revenue"
  if (ctx.contextKey.includes("vent revenue")) return "Vent Revenue"
  if (ctx.contextKey.includes("other operating revenue")) return "Other Operating Revenue"
  if (ctx.contextKey.includes("miscellaneous operating revenue")) {
    return "Other Operating Revenue"
  }
  if (ctx.contextKey.includes("interest income")) return "Other Operating Revenue"
  if (ctx.lineItemKey === "revenue") return "Revenue"

  return cleanLabel(ctx.subsection ?? ctx.lineItem)
}

function classifyLaborLabel(ctx: {
  lineItemKey: string
  contextKey: string
}): string {
  if (ctx.lineItemKey === "payroll taxes") return "Payroll Taxes"
  if (ctx.lineItemKey === "employee benefits") return "Employee Benefits"
  if (ctx.lineItemKey === "personnel expenses") return "Employee Benefits"
  if (
    AGENCY_STAFFING_COMPONENTS.has(ctx.lineItemKey) ||
    ctx.contextKey.includes("agency staffing") ||
    ctx.contextKey.includes("contract labor") ||
    ctx.contextKey.includes("registry")
  ) {
    return "Agency Staffing"
  }
  return "Wages"
}

function classifyExpenseLabel(ctx: {
  subsection: string | null
  lineItem: string
  lineItemKey: string
  contextKey: string
}): string {
  if (containsAny(ctx.contextKey, ["dietary", "nutrition services"])) return "Dietary"
  if (containsAny(ctx.contextKey, ["speech therapy", "physical therapy", "therapy"])) {
    return "Therapy"
  }
  if (
    containsAny(ctx.contextKey, [
      "utilities",
      "electric",
      "gas",
      "water",
      "sewer",
      "internet",
      "dsl",
      "cable",
      "telephone",
      "communications"
    ])
  ) {
    return "Utilities"
  }
  if (containsAny(ctx.contextKey, ["housekeeping", "laundry", "environmental"])) {
    return "Environmental Services"
  }
  if (
    containsAny(ctx.contextKey, [
      "maintenance",
      "repairs",
      "groundskeeping",
      "garbage",
      "pest control",
      "snow removal"
    ])
  ) {
    return "Maintenance"
  }
  if (containsAny(ctx.contextKey, ["activities", "resident entertainer"])) {
    return "Activities"
  }
  if (containsAny(ctx.contextKey, ["social services", "social worker"])) {
    return "Social Services"
  }
  if (containsAny(ctx.contextKey, ["marketing", "liaisons", "liaison", "intake"])) {
    return "Marketing"
  }
  if (
    containsAny(ctx.contextKey, [
      "administrative and general",
      "administrator",
      "business office",
      "human resources",
      "legal fees",
      "banking charges",
      "dues",
      "subscriptions"
    ])
  ) {
    return "Administrative and General"
  }
  if (containsAny(ctx.contextKey, ["medical services", "medical supplies", "pharmacy"])) {
    return "Medical Services & Supplies"
  }
  if (ctx.contextKey.includes("insurance")) return "Insurance"
  if (ctx.contextKey.includes("purchased services")) return "Purchased Services"
  if (ctx.contextKey.includes("supplies")) return "Supplies"
  if (ctx.lineItemKey === "operating expenses") return "Operating Expenses"
  if (ctx.contextKey.includes("other operating expenses")) return "Other Operating Expenses"

  return cleanLabel(ctx.subsection ?? ctx.lineItem)
}

function classifyPayer(contextKey: string): string | undefined {
  if (contextKey.includes("medicare part a") || contextKey.includes("medicare a")) {
    return "Medicare Part A"
  }
  if (contextKey.includes("medicare b")) return "Medicare Part B"
  if (contextKey.includes("managed medicare")) return "Managed Medicare"
  if (contextKey.includes("medicaid pending")) return "Medicaid Pending"
  if (contextKey.includes("medicaid hmo")) return "Medicaid HMO"
  if (contextKey.includes("medicaid")) return "Medicaid"
  if (contextKey.includes("private pay") || contextKey.includes("private")) {
    return "Private Pay"
  }
  if (contextKey.includes("commercial hmo")) return "Commercial HMO"
  if (contextKey.includes("hospice")) return "Hospice"
  if (contextKey.includes("respite")) return "Respite"
  if (contextKey.includes("va")) return "VA"
  return undefined
}

function payersAreComparable(payer: string | undefined): payer is string {
  return typeof payer === "string" && payer.length > 0
}

function inferPeriod(sheetName: string): string | undefined {
  const cleaned = sheetName.trim()
  const actualVsBudgetMatch = cleaned.match(/actual vs budget\s*[–-]\s*(.+)$/i)
  if (actualVsBudgetMatch) {
    const period = actualVsBudgetMatch[1].trim()
    if (MONTH_NAMES.has(period.toLowerCase())) return period
    return period
  }
  if (/t12/i.test(cleaned)) return "T12"
  return undefined
}

function inferReportType(sheetName: string): string | undefined {
  const cleaned = sheetName.trim().toLowerCase()
  if (cleaned.startsWith("actual vs budget")) return "Actual vs Budget"
  if (cleaned.includes("profit and loss report") && cleaned.includes("t12")) {
    return "Profit and Loss Report T12"
  }
  return undefined
}

function cleanOptional(value: string | null): string | null {
  if (value === null) return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

function cleanLabel(value: string): string {
  return value.trim() || value
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[/%(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

function calculateDifference(
  actual: number | null | undefined,
  budget: number | null | undefined
): number | null {
  if (actual === null && budget === null) return null
  if (actual === undefined && budget === undefined) return null
  return (actual ?? 0) - (budget ?? 0)
}

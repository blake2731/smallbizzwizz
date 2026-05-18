import ExcelJS from "exceljs"

export type FinancialRecord = {
  sheetName: string
  rowNumber: number
  outlineLevel: number
  section: string | null
  subsection: string | null
  lineItem: string
  isHeader: boolean
  isTotal: boolean
  isHidden: boolean
  actual: number | null
  actualPpd: number | null
  budget: number | null
  budgetPpd: number | null
  variance: number | null
  variancePpd: number | null
}

export type ValidationIssue = {
  sheetName: string
  totalRowNumber: number
  section: string | null
  subsection: string | null
  lineItem: string
  field: "actual" | "budget"
  expected: number
  childSum: number
  diff: number
  childCount: number
}

export type SheetParse = {
  sheetName: string
  format: "actual_vs_budget" | "unsupported"
  records: FinancialRecord[]
  issues: ValidationIssue[]
  notes: string[]
}

type Metrics = Pick<
  FinancialRecord,
  "actual" | "actualPpd" | "budget" | "budgetPpd" | "variance" | "variancePpd"
>

type OpenHeader = { label: string; openedAtRow: number }
type Accumulator = { actual: number; budget: number; count: number }

const SUM_TOLERANCE = 0.5

export async function parseCypressWorkbook(
  buf: ArrayBuffer | Buffer
): Promise<SheetParse[]> {
  const wb = new ExcelJS.Workbook()
  const arrayBuffer =
    buf instanceof ArrayBuffer
      ? buf
      : (buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  await wb.xlsx.load(arrayBuffer)

  return wb.worksheets.map((ws) => parseSheet(ws))
}

function parseSheet(ws: ExcelJS.Worksheet): SheetParse {
  const notes: string[] = []
  const format = detectFormat(ws)

  if (format !== "actual_vs_budget") {
    notes.push(
      `Sheet "${ws.name}" is not in the Actual-vs-Budget layout (row 4 col B != "$" or col E != "Bgt $"). Parser does not yet support this layout.`
    )
    return { sheetName: ws.name, format: "unsupported", records: [], issues: [], notes }
  }

  const records: FinancialRecord[] = []
  const issues: ValidationIssue[] = []
  const openByLevel = new Map<number, OpenHeader>()
  const openSums = new Map<number, Accumulator>()

  const sectionAt = (excludingLevel: number | null = null): string | null => {
    const o = openByLevel.get(0)
    if (!o) return null
    return excludingLevel === 0 ? null : o.label
  }
  const subsectionAt = (excludingLevel: number | null = null): string | null => {
    const o = openByLevel.get(1)
    if (!o) return null
    return excludingLevel === 1 ? null : o.label
  }

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 4) return // header band

    const level = row.outlineLevel ?? 0
    const labelCell = row.getCell(1)
    const rawLabel = cellValueToString(labelCell.value)
    const label = rawLabel.trim()
    const isBold = !!labelCell.font?.bold
    const isHidden = !!row.hidden

    const metrics = extractMetrics(row)
    const hasValues =
      metrics.actual !== null ||
      metrics.actualPpd !== null ||
      metrics.budget !== null ||
      metrics.budgetPpd !== null ||
      metrics.variance !== null ||
      metrics.variancePpd !== null

    // Pure spacer
    if (!label && !hasValues) return

    // Cypress encodes hierarchy via outlineLevel + value-presence at every depth.
    // Bold is only used at L0/L1 here so it is incidental, not load-bearing.
    // Rules:
    //  - label + no values  → OPENS a section at this outline level
    //  - label + values, AND the open header at this level shares the label → CLOSING TOTAL
    //  - anything else with content → LINE ITEM
    void isBold

    // Opening header: has label, no values
    if (label && !hasValues) {
      // Close any orphan deeper levels — they should have closed before this opens.
      // Also clobber a same-level opener that never matched a close (rare, but defensive).
      for (const k of [...openByLevel.keys()]) {
        if (k >= level) {
          openByLevel.delete(k)
          openSums.delete(k)
        }
      }

      openByLevel.set(level, { label, openedAtRow: rowNumber })
      openSums.set(level, { actual: 0, budget: 0, count: 0 })

      records.push({
        sheetName: ws.name,
        rowNumber,
        outlineLevel: level,
        section: level === 0 ? null : sectionAt(),
        subsection: level <= 1 ? null : subsectionAt(),
        lineItem: label,
        isHeader: true,
        isTotal: false,
        isHidden,
        ...metrics
      })
      return
    }

    // Closing total candidate: label + values where the open header at this level matches
    const opener = openByLevel.get(level)
    if (label && hasValues && opener?.label === label) {
      const accum = openSums.get(level)
      const sectionForRecord = level === 0 ? null : sectionAt()
      const subsectionForRecord = level <= 1 ? null : subsectionAt()

      if (accum) {
        validateAgainstAccumulator(
          { sheetName: ws.name, rowNumber, level, label, sectionForRecord, subsectionForRecord, metrics, accum },
          issues
        )
      }

      // Roll the matched total up to the grandparent accumulator. The underlying
      // line items contributed to OUR accumulator (this level), not the parent's.
      addToParentSum(openSums, level, metrics)

      openByLevel.delete(level)
      openSums.delete(level)
      // Defensive: also clear deeper levels that might still be open.
      for (const k of [...openByLevel.keys()]) {
        if (k > level) {
          openByLevel.delete(k)
          openSums.delete(k)
        }
      }

      records.push({
        sheetName: ws.name,
        rowNumber,
        outlineLevel: level,
        section: sectionForRecord,
        subsection: level === 1 ? label : subsectionForRecord,
        lineItem: label,
        isHeader: false,
        isTotal: true,
        isHidden,
        ...metrics
      })
      return
    }

    // Line item (regular detail row)
    addToParentSum(openSums, level, metrics)
    records.push({
      sheetName: ws.name,
      rowNumber,
      outlineLevel: level,
      section: sectionAt(),
      subsection: subsectionAt(),
      lineItem: label,
      isHeader: false,
      isTotal: false,
      isHidden,
      ...metrics
    })
  })

  return { sheetName: ws.name, format: "actual_vs_budget", records, issues, notes }
}

function detectFormat(ws: ExcelJS.Worksheet): SheetParse["format"] {
  const h = ws.getRow(4)
  const colB = cellValueToString(h.getCell(2).value).trim()
  const colE = cellValueToString(h.getCell(5).value).trim()
  if (colB === "$" && colE === "Bgt $") return "actual_vs_budget"
  return "unsupported"
}

function extractMetrics(row: ExcelJS.Row): Metrics {
  return {
    actual: cellNumberOrNull(row.getCell(2).value),
    actualPpd: cellNumberOrNull(row.getCell(3).value),
    budget: cellNumberOrNull(row.getCell(5).value),
    budgetPpd: cellNumberOrNull(row.getCell(6).value),
    variance: cellNumberOrNull(row.getCell(7).value),
    variancePpd: cellNumberOrNull(row.getCell(8).value)
  }
}

function addToParentSum(
  openSums: Map<number, Accumulator>,
  level: number,
  metrics: Metrics
) {
  if (level <= 0) return
  // Only contribute to the IMMEDIATE parent's accumulator. If the immediate parent
  // is not an explicit opener, this row is treated as drill-down detail under a
  // "Style B" synthetic parent (a row at L-1 that carries the rollup value itself).
  // Walking past the missing parent would double-count against the grandparent.
  const a = openSums.get(level - 1)
  if (!a) return
  if (metrics.actual !== null) a.actual += metrics.actual
  if (metrics.budget !== null) a.budget += metrics.budget
  a.count++
}

function validateAgainstAccumulator(
  ctx: {
    sheetName: string
    rowNumber: number
    level: number
    label: string
    sectionForRecord: string | null
    subsectionForRecord: string | null
    metrics: Metrics
    accum: Accumulator
  },
  issues: ValidationIssue[]
) {
  if (ctx.accum.count === 0) return // nothing under this total to validate against

  if (ctx.metrics.actual !== null && Math.abs(ctx.accum.actual - ctx.metrics.actual) > SUM_TOLERANCE) {
    issues.push({
      sheetName: ctx.sheetName,
      totalRowNumber: ctx.rowNumber,
      section: ctx.sectionForRecord,
      subsection: ctx.level === 1 ? ctx.label : ctx.subsectionForRecord,
      lineItem: ctx.label,
      field: "actual",
      expected: ctx.metrics.actual,
      childSum: ctx.accum.actual,
      diff: ctx.accum.actual - ctx.metrics.actual,
      childCount: ctx.accum.count
    })
  }

  if (ctx.metrics.budget !== null && Math.abs(ctx.accum.budget - ctx.metrics.budget) > SUM_TOLERANCE) {
    issues.push({
      sheetName: ctx.sheetName,
      totalRowNumber: ctx.rowNumber,
      section: ctx.sectionForRecord,
      subsection: ctx.level === 1 ? ctx.label : ctx.subsectionForRecord,
      lineItem: ctx.label,
      field: "budget",
      expected: ctx.metrics.budget,
      childSum: ctx.accum.budget,
      diff: ctx.accum.budget - ctx.metrics.budget,
      childCount: ctx.accum.count
    })
  }
}

function cellValueToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("")
    }
    if ("formula" in v && "result" in v) {
      const r = (v as { result?: unknown }).result
      return r == null ? "" : String(r)
    }
    if ("text" in v) return String((v as { text?: unknown }).text ?? "")
  }
  return ""
}

function cellNumberOrNull(v: ExcelJS.CellValue): number | null {
  if (typeof v === "number") return v
  if (v && typeof v === "object") {
    if ("result" in v) {
      const r = (v as { result?: unknown }).result
      if (typeof r === "number") return r
    }
  }
  return null
}

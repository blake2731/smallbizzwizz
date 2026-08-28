import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import { parseCypressWorkbook } from "../lib/parsers/cypress"

type RowInput = {
  label: string
  level: number
  actual?: ExcelJS.CellValue
  budget?: ExcelJS.CellValue
  hidden?: boolean
}

function configureActualVsBudgetHeader(ws: ExcelJS.Worksheet) {
  ws.getCell("B4").value = "$"
  ws.getCell("E4").value = "Bgt $"
}

function addFinancialRow(ws: ExcelJS.Worksheet, rowNumber: number, input: RowInput) {
  const row = ws.getRow(rowNumber)
  row.outlineLevel = input.level
  row.hidden = input.hidden ?? false
  row.getCell(1).value = input.label
  if (input.actual !== undefined) row.getCell(2).value = input.actual
  if (input.budget !== undefined) row.getCell(5).value = input.budget
}

async function serializeWorkbook(build: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook()
  build(workbook)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe("parseCypressWorkbook", () => {
  it("rejects layouts that do not match the supported Actual versus Budget header", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Unsupported")
      ws.getCell("B4").value = "Actual"
      ws.getCell("E4").value = "Budget"
      addFinancialRow(ws, 5, { label: "Revenue", level: 0, actual: 100, budget: 100 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)

    expect(sheet.format).toBe("unsupported")
    expect(sheet.records).toEqual([])
    expect(sheet.issues).toEqual([])
    expect(sheet.notes[0]).toContain("Parser does not yet support this layout")
  })

  it("parses hierarchy and reconciles a valid closing total", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("P&L")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, { label: "Room Revenue", level: 1, actual: 60, budget: 55 })
      addFinancialRow(ws, 7, { label: "Service Revenue", level: 1, actual: 40, budget: 45 })
      addFinancialRow(ws, 8, { label: "Revenue", level: 0, actual: 100, budget: 100 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)

    expect(sheet.format).toBe("actual_vs_budget")
    expect(sheet.issues).toEqual([])
    expect(sheet.records).toHaveLength(4)
    expect(sheet.records[0]).toMatchObject({
      lineItem: "Revenue",
      isHeader: true,
      isTotal: false,
      section: null,
    })
    expect(sheet.records[1]).toMatchObject({
      lineItem: "Room Revenue",
      section: "Revenue",
      actual: 60,
      budget: 55,
    })
    expect(sheet.records[3]).toMatchObject({
      lineItem: "Revenue",
      isHeader: false,
      isTotal: true,
      actual: 100,
      budget: 100,
    })
  })

  it("accepts a closing total exactly at the reconciliation tolerance", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Tolerance")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, { label: "Room Revenue", level: 1, actual: 100, budget: 100 })
      addFinancialRow(ws, 7, { label: "Revenue", level: 0, actual: 100.5, budget: 100 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)

    expect(sheet.issues).toEqual([])
  })

  it("reports a reconciliation mismatch beyond the tolerance", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Mismatch")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, { label: "Room Revenue", level: 1, actual: 100, budget: 100 })
      addFinancialRow(ws, 7, { label: "Revenue", level: 0, actual: 100.51, budget: 100 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)

    expect(sheet.issues).toHaveLength(1)
    expect(sheet.issues[0]).toMatchObject({
      lineItem: "Revenue",
      field: "actual",
      expected: 100.51,
      childSum: 100,
      childCount: 1,
    })
    expect(sheet.issues[0].diff).toBeCloseTo(-0.51, 8)
  })

  it("does not double count drill down rows when the immediate parent is a value row", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Drilldown")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, { label: "Room Revenue", level: 1, actual: 100, budget: 100 })
      addFinancialRow(ws, 7, { label: "Private Pay", level: 2, actual: 60, budget: 60 })
      addFinancialRow(ws, 8, { label: "Managed Care", level: 2, actual: 40, budget: 40 })
      addFinancialRow(ws, 9, { label: "Revenue", level: 0, actual: 100, budget: 100 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)

    expect(sheet.issues).toEqual([])
    expect(sheet.records.find((record) => record.lineItem === "Private Pay")).toMatchObject({
      outlineLevel: 2,
      section: "Revenue",
      actual: 60,
    })
  })

  it("uses cached numeric formula results as financial values", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Formula")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, {
        label: "Room Revenue",
        level: 1,
        actual: { formula: "50+50", result: 100 },
        budget: { formula: "45+45", result: 90 },
      })
      addFinancialRow(ws, 7, { label: "Revenue", level: 0, actual: 100, budget: 90 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)
    const detail = sheet.records.find((record) => record.lineItem === "Room Revenue")

    expect(sheet.issues).toEqual([])
    expect(detail).toMatchObject({ actual: 100, budget: 90 })
  })

  it("preserves hidden source rows in the parsed record metadata", async () => {
    const buffer = await serializeWorkbook((workbook) => {
      const ws = workbook.addWorksheet("Hidden")
      configureActualVsBudgetHeader(ws)
      addFinancialRow(ws, 5, { label: "Revenue", level: 0 })
      addFinancialRow(ws, 6, {
        label: "Hidden Adjustment",
        level: 1,
        actual: 10,
        budget: 10,
        hidden: true,
      })
      addFinancialRow(ws, 7, { label: "Revenue", level: 0, actual: 10, budget: 10 })
    })

    const [sheet] = await parseCypressWorkbook(buffer)
    const hidden = sheet.records.find((record) => record.lineItem === "Hidden Adjustment")

    expect(sheet.issues).toEqual([])
    expect(hidden?.isHidden).toBe(true)
  })
})

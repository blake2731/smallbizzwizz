import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import {
  db,
  facility,
  insightPacket,
  narrative,
  normalizedFinancialRecord as normalizedFinancialRecordTable,
  reportingPeriod,
  upload
} from "@/lib/db"
import { parseCypressWorkbook, type SheetParse } from "@/lib/parsers/cypress"
import { normalizeWorkbookRecords } from "./financialMappings"
import { generateInsightPackets } from "./insights"
import {
  buildNarrativeSourceData,
  buildOperationalInsightId,
  generateExecutiveNarrative,
  NARRATIVE_AUDIENCES,
  type NarrativeResult
} from "./narratives"
import type {
  NormalizedFinancialRecord,
  OperationalInsight
} from "./types"

export type UploadStatus =
  | "processing"
  | "completed"
  | "partial"
  | "failed_validation"
  | "failed_normalization"
  | "failed_processing"

export type UploadStage =
  | "uploaded"
  | "parsing"
  | "validating"
  | "normalizing"
  | "insights"
  | "narratives"
  | "persisting"
  | "complete"
  | "failed"

export type ValidationStats = {
  totalSheetCount: number
  supportedSheetCount: number
  unsupportedSheetCount: number
  supportedIssueFreeSheetCount: number
  totalIssueCount: number
  totalRecordCount: number
  normalizedRecordCount: number
  leafRecordCount: number
}

export type UploadDiagnostic = {
  stage: string
  message: string
  detail?: string
}

export type UploadProcessResult = {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
  status: UploadStatus
  integrityScore: number
  validationStats: ValidationStats
  insightCount: number
  narrativeResults: NarrativeResult[]
  diagnostics: {
    sheetNotes: Array<{ sheetName: string; notes: string[]; issueCount: number }>
    warnings: UploadDiagnostic[]
  }
}

export type FacilitySelectionInput = {
  userId: string
  facilityId?: string | null
  facilityName?: string | null
}

export type ReportingPeriodAssignment = {
  label: string
  periodKey: string
  monthStart: string
}

export type UploadShell = {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
}

export async function createOrSelectFacility(
  input: FacilitySelectionInput
): Promise<{ id: string; name: string }> {
  const facilityId = cleanOptional(input.facilityId)
  const facilityName = cleanOptional(input.facilityName)

  if (facilityId) {
    const [existing] = await db
      .select({
        id: facility.id,
        name: facility.name
      })
      .from(facility)
      .where(and(eq(facility.id, facilityId), eq(facility.userId, input.userId)))
      .limit(1)

    if (!existing || !existing.id) {
      throw new Error("Selected facility could not be found.")
    }

    return existing
  }

  if (!facilityName) {
    throw new Error("Choose an existing facility or enter a new facility name.")
  }

  const existingFacilities = await db
    .select({
      id: facility.id,
      name: facility.name
    })
    .from(facility)
    .where(eq(facility.userId, input.userId))

  const matchedExisting = existingFacilities.find(
    (row) => normalizeKey(row.name) === normalizeKey(facilityName)
  )
  if (matchedExisting) return matchedExisting

  const [created] = await db
    .insert(facility)
    .values({
      userId: input.userId,
      name: facilityName,
      updatedAt: new Date()
    })
    .onConflictDoNothing()
    .returning({
      id: facility.id,
      name: facility.name
    })

  if (created) return created

  const rowsAfterInsert = await db
    .select({
      id: facility.id,
      name: facility.name
    })
    .from(facility)
    .where(eq(facility.userId, input.userId))

  const matched = rowsAfterInsert.find(
    (row) => normalizeKey(row.name) === normalizeKey(facilityName)
  )

  if (!matched) {
    throw new Error("Facility could not be created.")
  }

  return matched
}

export function buildReportingPeriodAssignment(
  reportingMonth: string
): ReportingPeriodAssignment {
  const cleaned = reportingMonth.trim()
  if (!/^\d{4}-\d{2}$/.test(cleaned)) {
    throw new Error("Reporting period must be assigned as YYYY-MM.")
  }

  const [year, month] = cleaned.split("-").map(Number)
  const monthStart = `${cleaned}-01`
  const date = new Date(Date.UTC(year, month - 1, 1))
  const label = date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  })

  return {
    label,
    periodKey: cleaned,
    monthStart
  }
}

export async function createUploadShell(args: {
  userId: string
  facilityId: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  reportingPeriod: ReportingPeriodAssignment
  checksumSha256: string
}): Promise<UploadShell> {
  const [createdUpload] = await db
    .insert(upload)
    .values({
      facilityId: args.facilityId,
      userId: args.userId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      fileSizeBytes: args.fileSizeBytes,
      checksumSha256: args.checksumSha256,
      status: "processing",
      processingStage: "uploaded",
      startedAt: new Date(),
      updatedAt: new Date()
    })
    .returning({
      id: upload.id
    })

  const [createdPeriod] = await db
    .insert(reportingPeriod)
    .values({
      facilityId: args.facilityId,
      uploadId: createdUpload.id,
      label: args.reportingPeriod.label,
      periodKey: args.reportingPeriod.periodKey,
      monthStart: args.reportingPeriod.monthStart
    })
    .returning({
      id: reportingPeriod.id
    })

  await db
    .update(facility)
    .set({
      updatedAt: new Date()
    })
    .where(eq(facility.id, args.facilityId))

  return {
    facilityId: args.facilityId,
    uploadId: createdUpload.id,
    reportingPeriodId: createdPeriod.id
  }
}

export function createWorkbookChecksum(
  buffer: ArrayBuffer | Buffer
): string {
  const hash = createHash("sha256")
  if (buffer instanceof Buffer) {
    hash.update(buffer)
  } else {
    hash.update(Buffer.from(new Uint8Array(buffer)))
  }
  return hash.digest("hex")
}

export async function processNursingHomeUpload(args: {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
  buffer: ArrayBuffer | Buffer
}): Promise<UploadProcessResult> {
  let validationStats = emptyValidationStats()
  const warnings: UploadDiagnostic[] = []

  try {
    await setUploadStage(args.uploadId, "parsing")
    const sheets = await parseCypressWorkbook(args.buffer)
    validationStats = baseValidationStats(sheets)

    const supportedSheets = sheets.filter((sheet) => sheet.format === "actual_vs_budget")
    if (supportedSheets.length === 0) {
      const diagnostics = buildDiagnostics(sheets, warnings)
      const integrityScore = 0
      await finalizeUpload(args.uploadId, {
        status: "failed_validation",
        stage: "failed",
        integrityScore,
        validationStats,
        diagnostics,
        processingErrors: [
          {
            stage: "validating",
            message: "Workbook did not contain any supported Actual-vs-Budget sheets."
          }
        ]
      })

      return {
        facilityId: args.facilityId,
        uploadId: args.uploadId,
        reportingPeriodId: args.reportingPeriodId,
        status: "failed_validation",
        integrityScore,
        validationStats,
        insightCount: 0,
        narrativeResults: [],
        diagnostics
      }
    }

    await setUploadStage(args.uploadId, "validating")

    const normalizedRecords = normalizeWorkbookRecords(supportedSheets)
    validationStats = withNormalizedRecordStats(sheets, normalizedRecords)
    const integrityScore = computeIntegrityScore(validationStats)

    await db
      .update(reportingPeriod)
      .set({
        sourcePeriodLabel: selectPrimarySourcePeriodLabel(normalizedRecords) ?? null
      })
      .where(eq(reportingPeriod.id, args.reportingPeriodId))

    if (normalizedRecords.length === 0 || validationStats.leafRecordCount === 0) {
      const diagnostics = buildDiagnostics(sheets, warnings)
      await finalizeUpload(args.uploadId, {
        status: "failed_normalization",
        stage: "failed",
        integrityScore,
        validationStats,
        diagnostics,
        processingErrors: [
          {
            stage: "normalizing",
            message: "Workbook parsing completed, but no normalized financial rows were produced."
          }
        ]
      })

      return {
        facilityId: args.facilityId,
        uploadId: args.uploadId,
        reportingPeriodId: args.reportingPeriodId,
        status: "failed_normalization",
        integrityScore,
        validationStats,
        insightCount: 0,
        narrativeResults: [],
        diagnostics
      }
    }

    if (validationStats.totalIssueCount > 0) {
      warnings.push({
        stage: "validating",
        message: "One or more section totals did not fully reconcile to child rows.",
        detail: `${validationStats.totalIssueCount} validation issues were carried forward as visible diagnostics.`
      })
    }

    await setUploadStage(args.uploadId, "normalizing", {
      integrityScore,
      validationStats
    })

    const insights = generateInsightPackets(normalizedRecords)
    await setUploadStage(args.uploadId, "insights", {
      integrityScore,
      validationStats
    })

    const narrativeSource = buildNarrativeSourceData(
      normalizedRecords,
      insights,
      {
        supportedSheetCount: validationStats.supportedSheetCount,
        supportedIssueFreeSheetCount: validationStats.supportedIssueFreeSheetCount,
        totalRecords: validationStats.totalRecordCount,
        normalizedRecordCount: validationStats.normalizedRecordCount,
        leafRecordCount: validationStats.leafRecordCount,
        totalIssueCount: validationStats.totalIssueCount
      }
    )

    await setUploadStage(args.uploadId, "narratives", {
      integrityScore,
      validationStats
    })

    const narrativeResults = await Promise.all(
      NARRATIVE_AUDIENCES.map((audience) =>
        generateExecutiveNarrative(narrativeSource, audience)
      )
    )

    const narrativeWarnings = buildNarrativeWarnings(narrativeResults)
    warnings.push(...narrativeWarnings)

    await setUploadStage(args.uploadId, "persisting", {
      integrityScore,
      validationStats
    })

    await persistNormalizedRecords({
      facilityId: args.facilityId,
      uploadId: args.uploadId,
      reportingPeriodId: args.reportingPeriodId,
      records: normalizedRecords
    })
    await persistInsightPackets({
      facilityId: args.facilityId,
      uploadId: args.uploadId,
      reportingPeriodId: args.reportingPeriodId,
      insights
    })
    await persistNarratives({
      facilityId: args.facilityId,
      uploadId: args.uploadId,
      reportingPeriodId: args.reportingPeriodId,
      narratives: narrativeResults
    })

    const diagnostics = buildDiagnostics(sheets, warnings)
    const finalStatus =
      warnings.length > 0 ? "partial" : "completed"

    await finalizeUpload(args.uploadId, {
      status: finalStatus,
      stage: "complete",
      integrityScore,
      validationStats,
      diagnostics,
      processingErrors:
        narrativeWarnings.length > 0
          ? narrativeWarnings
          : null
    })

    return {
      facilityId: args.facilityId,
      uploadId: args.uploadId,
      reportingPeriodId: args.reportingPeriodId,
      status: finalStatus,
      integrityScore,
      validationStats,
      insightCount: insights.length,
      narrativeResults,
      diagnostics
    }
  } catch (error) {
    const diagnostics = buildDiagnostics([], warnings)
    const message =
      error instanceof Error ? error.message : "Unexpected processing error."

    await finalizeUpload(args.uploadId, {
      status: "failed_processing",
      stage: "failed",
      integrityScore: computeIntegrityScore(validationStats),
      validationStats,
      diagnostics,
      processingErrors: [
        {
          stage: "processing",
          message
        }
      ]
    })

    return {
      facilityId: args.facilityId,
      uploadId: args.uploadId,
      reportingPeriodId: args.reportingPeriodId,
      status: "failed_processing",
      integrityScore: computeIntegrityScore(validationStats),
      validationStats,
      insightCount: 0,
      narrativeResults: [],
      diagnostics
    }
  }
}

async function persistNormalizedRecords(args: {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
  records: NormalizedFinancialRecord[]
}) {
  const rows = args.records.map((record) => ({
    facilityId: args.facilityId,
    uploadId: args.uploadId,
    reportingPeriodId: args.reportingPeriodId,
    sheetName: record.sheetName,
    rowNumber: record.rowNumber,
    section: record.section ?? null,
    subsection: record.subsection ?? null,
    category: record.category ?? null,
    subcategory: record.subcategory ?? null,
    lineItem: record.lineItem,
    period: record.period ?? null,
    reportType: record.reportType ?? null,
    actual: record.actual ?? null,
    budget: record.budget ?? null,
    variance: record.variance ?? null,
    actualPpd: record.actualPpd ?? null,
    budgetPpd: record.budgetPpd ?? null,
    variancePpd: record.variancePpd ?? null,
    isTotal: record.isTotal,
    isHidden: record.isHidden
  }))

  for (const chunk of chunkArray(rows, 500)) {
    await db.insert(normalizedFinancialRecordTable).values(chunk)
  }
}

async function persistInsightPackets(args: {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
  insights: OperationalInsight[]
}) {
  const rows = args.insights.map((insight) => ({
    facilityId: args.facilityId,
    uploadId: args.uploadId,
    reportingPeriodId: args.reportingPeriodId,
    insightKey: buildOperationalInsightId(insight),
    type: insight.type,
    severity: insight.severity,
    category: insight.category ?? null,
    subcategory: insight.subcategory ?? null,
    section: insight.section ?? null,
    subsection: insight.subsection ?? null,
    lineItem: insight.lineItem ?? null,
    period: insight.period ?? null,
    title: insight.title,
    explanation: insight.explanation,
    triggerReason: insight.triggerReason ?? null,
    trendDirection: insight.trendDirection,
    supportingMetrics: insight.supportingMetrics,
    thresholdsExceeded: insight.thresholdsExceeded ?? null,
    periodsInvolved: insight.periodsInvolved ?? null
  }))

  for (const chunk of chunkArray(rows, 250)) {
    await db.insert(insightPacket).values(chunk)
  }
}

async function persistNarratives(args: {
  facilityId: string
  uploadId: string
  reportingPeriodId: string
  narratives: NarrativeResult[]
}) {
  const rows = args.narratives.map((entry) => ({
    facilityId: args.facilityId,
    uploadId: args.uploadId,
    reportingPeriodId: args.reportingPeriodId,
    audience: entry.audience,
    status: entry.status,
    model: entry.model ?? null,
    promptContext: entry.promptContext,
    promptText: entry.promptText,
    narrativeText: entry.narrative ?? null,
    errorMessage: entry.error ?? null,
    supportingInsightIds: entry.supportingInsightIds
  }))

  await db.insert(narrative).values(rows)
}

async function setUploadStage(
  uploadId: string,
  stage: UploadStage,
  extras?: {
    integrityScore?: number
    validationStats?: ValidationStats
  }
) {
  await db
    .update(upload)
    .set({
      processingStage: stage,
      integrityScore: extras?.integrityScore ?? null,
      validationStats: extras?.validationStats ?? null,
      updatedAt: new Date()
    })
    .where(eq(upload.id, uploadId))
}

async function finalizeUpload(argsUploadId: string, args: {
  status: UploadStatus
  stage: UploadStage
  integrityScore: number
  validationStats: ValidationStats
  diagnostics: UploadProcessResult["diagnostics"]
  processingErrors: UploadDiagnostic[] | null
}) {
  await db
    .update(upload)
    .set({
      status: args.status,
      processingStage: args.stage,
      integrityScore: args.integrityScore,
      validationStats: args.validationStats,
      diagnostics: args.diagnostics,
      processingErrors: args.processingErrors,
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(upload.id, argsUploadId))
}

function buildNarrativeWarnings(
  narratives: NarrativeResult[]
): UploadDiagnostic[] {
  return narratives
    .filter((entry) => entry.status !== "generated")
    .map((entry) => ({
      stage: "narratives",
      message: `${entry.audience} narrative ${entry.status}.`,
      detail: entry.error ?? "Narrative output is unavailable for this audience."
    }))
}

function buildDiagnostics(
  sheets: SheetParse[],
  warnings: UploadDiagnostic[]
): UploadProcessResult["diagnostics"] {
  return {
    sheetNotes: sheets
      .filter((sheet) => sheet.notes.length > 0 || sheet.issues.length > 0)
      .map((sheet) => ({
        sheetName: sheet.sheetName,
        notes: sheet.notes,
        issueCount: sheet.issues.length
      })),
    warnings
  }
}

function baseValidationStats(sheets: SheetParse[]): ValidationStats {
  const totalRecordCount = sheets.reduce(
    (count, sheet) => count + sheet.records.length,
    0
  )
  const supportedSheets = sheets.filter((sheet) => sheet.format === "actual_vs_budget")
  const totalIssueCount = supportedSheets.reduce(
    (count, sheet) => count + sheet.issues.length,
    0
  )

  return {
    totalSheetCount: sheets.length,
    supportedSheetCount: supportedSheets.length,
    unsupportedSheetCount: sheets.length - supportedSheets.length,
    supportedIssueFreeSheetCount: supportedSheets.filter(
      (sheet) => sheet.issues.length === 0
    ).length,
    totalIssueCount,
    totalRecordCount,
    normalizedRecordCount: 0,
    leafRecordCount: 0
  }
}

function withNormalizedRecordStats(
  sheets: SheetParse[],
  records: NormalizedFinancialRecord[]
): ValidationStats {
  const base = baseValidationStats(sheets)
  return {
    ...base,
    normalizedRecordCount: records.length,
    leafRecordCount: records.filter(
      (record) =>
        !record.isTotal &&
        (record.actual !== null && record.actual !== undefined ||
          record.budget !== null && record.budget !== undefined ||
          record.variance !== null && record.variance !== undefined ||
          record.actualPpd !== null && record.actualPpd !== undefined ||
          record.budgetPpd !== null && record.budgetPpd !== undefined ||
          record.variancePpd !== null && record.variancePpd !== undefined)
    ).length
  }
}

function emptyValidationStats(): ValidationStats {
  return {
    totalSheetCount: 0,
    supportedSheetCount: 0,
    unsupportedSheetCount: 0,
    supportedIssueFreeSheetCount: 0,
    totalIssueCount: 0,
    totalRecordCount: 0,
    normalizedRecordCount: 0,
    leafRecordCount: 0
  }
}

export function computeIntegrityScore(stats: ValidationStats): number {
  if (stats.supportedSheetCount === 0) return 0

  const issueFreeRatio =
    stats.supportedIssueFreeSheetCount / stats.supportedSheetCount
  const unsupportedPenalty = Math.min(stats.unsupportedSheetCount * 8, 24)
  const issuePenalty = Math.min(stats.totalIssueCount * 3, 36)
  const emptyPenalty = stats.normalizedRecordCount === 0 ? 40 : 0
  const leafPenalty = stats.leafRecordCount === 0 ? 25 : 0

  return clamp(
    Math.round(issueFreeRatio * 100) - unsupportedPenalty - issuePenalty - emptyPenalty - leafPenalty,
    0,
    100
  )
}

function selectPrimarySourcePeriodLabel(
  records: NormalizedFinancialRecord[]
): string | undefined {
  const candidates = records
    .map((record) => record.period)
    .filter((period): period is string => Boolean(period))
    .filter((period) => normalizeKey(period) !== "t12")

  if (candidates.length === 0) return records.find((record) => record.period)?.period

  const counts = new Map<string, number>()
  for (const period of candidates) {
    counts.set(period, (counts.get(period) ?? 0) + 1)
  }

  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return sortPeriods(left[0], right[0])
  })[0]?.[0]
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
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
  const monthOrder = new Map([
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

  const leftIndex = monthOrder.get(normalizeKey(left)) ?? Number.MAX_SAFE_INTEGER
  const rightIndex = monthOrder.get(normalizeKey(right)) ?? Number.MAX_SAFE_INTEGER

  if (leftIndex !== rightIndex) return leftIndex - rightIndex
  return left.localeCompare(right)
}

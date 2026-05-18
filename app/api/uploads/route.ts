import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import {
  buildReportingPeriodAssignment,
  createOrSelectFacility,
  createUploadShell,
  createWorkbookChecksum,
  processNursingHomeUpload
} from "@/lib/verticals/nursing-home/pipeline"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ACCEPTED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/octet-stream"
])

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 })
  }

  const formData = await request.formData()
  const workbook = formData.get("workbook")
  const facilityId = stringValue(formData.get("facilityId"))
  const facilityName = stringValue(formData.get("facilityName"))
  const reportingMonth = stringValue(formData.get("reportingMonth"))

  if (!(workbook instanceof File) || workbook.size === 0) {
    return redirectToUploadError(request, "Choose a workbook file to process.")
  }

  if (!isAcceptedWorkbook(workbook)) {
    return redirectToUploadError(
      request,
      "Upload an .xlsx or .xlsm workbook export."
    )
  }

  if (!reportingMonth) {
    return redirectToUploadError(request, "Assign a reporting period before uploading.")
  }

  let selectedFacility: { id: string; name: string }
  try {
    selectedFacility = await createOrSelectFacility({
      userId,
      facilityId,
      facilityName
    })
  } catch (error) {
    return redirectToUploadError(
      request,
      error instanceof Error ? error.message : "Facility selection failed."
    )
  }

  let reportingPeriod
  try {
    reportingPeriod = buildReportingPeriodAssignment(reportingMonth)
  } catch (error) {
    return redirectToUploadError(
      request,
      error instanceof Error ? error.message : "Reporting period is invalid."
    )
  }

  const buffer = Buffer.from(await workbook.arrayBuffer())
  const checksumSha256 = createWorkbookChecksum(buffer)

  const shell = await createUploadShell({
    userId,
    facilityId: selectedFacility.id,
    fileName: workbook.name,
    mimeType: workbook.type || "application/octet-stream",
    fileSizeBytes: workbook.size,
    reportingPeriod,
    checksumSha256
  })

  await processNursingHomeUpload({
    facilityId: shell.facilityId,
    uploadId: shell.uploadId,
    reportingPeriodId: shell.reportingPeriodId,
    buffer
  })

  const destination = new URL(`/facilities/${shell.facilityId}`, request.url)
  destination.searchParams.set("uploadId", shell.uploadId)
  return NextResponse.redirect(destination, { status: 303 })
}

function redirectToUploadError(request: Request, message: string) {
  const destination = new URL("/upload", request.url)
  destination.searchParams.set("error", message)
  return NextResponse.redirect(destination, { status: 303 })
}

function stringValue(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

function isAcceptedWorkbook(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  const byExtension = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")
  return byExtension || ACCEPTED_MIME_TYPES.has(file.type)
}

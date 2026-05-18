import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { db, facility } from "@/lib/db"
import UploadForm from "./UploadForm"

export const dynamic = "force-dynamic"

export default async function UploadPage(props: {
  searchParams: Promise<{
    error?: string | string[]
  }>
}) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const searchParams = await props.searchParams
  const error = firstValue(searchParams.error)

  const facilities = await db
    .select({
      id: facility.id,
      name: facility.name
    })
    .from(facility)
    .where(eq(facility.userId, userId))
    .orderBy(desc(facility.updatedAt))

  const now = new Date()
  const defaultReportingMonth = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #eef5fb 0%, #f7fafc 42%, #ffffff 100%)",
        color: "#10263a",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "40px 20px 60px"
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 22
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                color: "#4f6f8d",
                marginBottom: 8
              }}
            >
              Skilled Nursing Operational Intelligence
            </div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "2.25rem",
                fontWeight: 400,
                letterSpacing: "-0.03em",
                margin: 0
              }}
            >
              Facility upload and snapshot processing
            </h1>
          </div>

          <Link
            href="/chat"
            style={{
              textDecoration: "none",
              color: "#17497a",
              fontWeight: 700,
              fontSize: 14
            }}
          >
            Back to app
          </Link>
        </div>

        <p
          style={{
            maxWidth: 760,
            fontSize: 16,
            lineHeight: 1.7,
            color: "#36546d",
            marginTop: 0,
            marginBottom: 24
          }}
        >
          Upload a facility workbook, persist the reporting snapshot, and land on an
          operator dashboard built from deterministic analytics, explainable insight
          packets, and tightly scoped executive narratives.
        </p>

        {error && (
          <section
            style={{
              marginBottom: 20,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              borderRadius: 16,
              padding: "14px 16px",
              fontSize: 14,
              lineHeight: 1.6
            }}
          >
            {error}
          </section>
        )}

        <UploadForm
          facilities={facilities}
          defaultReportingMonth={defaultReportingMonth}
        />
      </div>
    </main>
  )
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

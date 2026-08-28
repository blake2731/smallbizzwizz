import { NextResponse } from 'next/server'
import { getControlPlaneState } from '@/lib/control-plane'

export const dynamic = 'force-static'

export async function GET() {
  try {
    const state = await getControlPlaneState()
    const result = {
      ok: true,
      roles: state.roles.length,
      objectives: state.objectives.length,
      workItems: state.work.length,
      handoffs: state.handoffs.length,
      decisions: state.decisions.length,
    }

    console.log('[control-plane-preview-smoke]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error) {
    const result = {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown control plane error',
    }
    console.error('[control-plane-preview-smoke]', JSON.stringify(result))
    return NextResponse.json(result, { status: 500 })
  }
}

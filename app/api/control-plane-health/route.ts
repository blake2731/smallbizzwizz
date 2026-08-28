import { NextResponse } from 'next/server'
import { getControlPlaneState } from '@/lib/control-plane'

export async function GET() {
  try {
    const state = await getControlPlaneState()
    return NextResponse.json({
      ok: true,
      roles: state.roles.length,
      objectives: state.objectives.length,
      workItems: state.work.length,
      handoffs: state.handoffs.length,
      decisions: state.decisions.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown control plane error',
      },
      { status: 500 },
    )
  }
}

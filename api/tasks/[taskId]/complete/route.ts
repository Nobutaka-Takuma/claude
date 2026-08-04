import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

// POST /api/tasks/:taskId/complete
// Called by the logged-in client after finishing an in-app survey.
// The reward is only granted after the server re-validates the answers
// against the task's own definition, so the client cannot self-report
// a completion it never actually did.

const bodySchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])),
})

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !userData.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id
  const { taskId } = params

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('type', 'survey')
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'task_not_found' }, { status: 404 })
  }

  const requiredQuestionIds: string[] = task.config?.required_question_ids ?? []
  const missing = requiredQuestionIds.filter((q) => !(q in parsed.data.answers))
  if (missing.length > 0) {
    return NextResponse.json({ error: 'incomplete_survey', missing }, { status: 422 })
  }

  // One reward per user per survey task.
  const idempotencyKey = `survey:${taskId}:${userId}`

  const { data: log, error: rpcError } = await supabaseAdmin.rpc('complete_task', {
    p_user_id: userId,
    p_task_id: taskId,
    p_idempotency_key: idempotencyKey,
    p_verification: { type: 'survey', answers: parsed.data.answers },
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: mapRpcErrorStatus(rpcError.message) })
  }

  return NextResponse.json({ ok: true, log })
}

function mapRpcErrorStatus(message: string): number {
  if (message.includes('duplicate') || message.includes('limit_reached')) return 409
  if (message.includes('not_found')) return 404
  if (message.includes('inactive') || message.includes('not_started') || message.includes('ended')) return 422
  return 400
}

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

// GET /api/webhooks/ad-reward
// Server-to-server callback (SSV: Server-Side Verification) from the ad
// network after a user finishes watching a rewarded video. This endpoint
// has no user session — trust comes only from the signature the ad
// network computes over the query string with a shared secret
// (AD_NETWORK_SSV_SECRET). Never grant a reward here without verifying it.
//
// Expected query params (matches the common AdMob/ironSource/AppLovin SSV
// shape; adjust field names to the network actually integrated):
//   user_id=<our uuid>&task_id=<our uuid>&transaction_id=<network id>&signature=<hex hmac>

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const signature = url.searchParams.get('signature')
  const signedPayload = buildSignedPayload(url)

  if (!signature || !verifySignature(signedPayload, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
  }

  const userId = url.searchParams.get('user_id')
  const taskId = url.searchParams.get('task_id')
  const transactionId = url.searchParams.get('transaction_id')

  if (!userId || !taskId || !transactionId) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const { data: log, error } = await supabaseAdmin.rpc('complete_task', {
    p_user_id: userId,
    p_task_id: taskId,
    p_idempotency_key: `ad:${transactionId}`,
    p_verification: {
      type: 'ad_view',
      provider: 'generic_ssv',
      raw: Object.fromEntries(url.searchParams),
    },
  })

  if (error) {
    // The ad network will retry on non-2xx; treat a duplicate as success
    // so it stops retrying, everything else is a real failure to fix.
    if (error.message.includes('duplicate')) {
      return NextResponse.json({ ok: true, note: 'already_processed' })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, log })
}

function buildSignedPayload(url: URL): string {
  const params = new URLSearchParams(url.search)
  params.delete('signature')
  params.sort()
  return params.toString()
}

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.AD_NETWORK_SSV_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)
}

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { completeTask, RpcError } from "@/lib/rpc";
import { rpcErrorResponse } from "@/lib/apiError";

// GET /api/webhooks/ad-reward
//
// Server-to-server callback (SSV: Server-Side Verification) an ad network
// would call after a user finishes a rewarded video, in production. This
// endpoint has no user session — trust comes only from the HMAC signature
// the ad network computes over the query string with a shared secret
// (AD_NETWORK_SSV_SECRET). The demo UI does NOT call this route (there is
// no real ad SDK wired into this local build); it exists as the reference
// implementation of the production path described in
// docs/02-backend-logic.md. See app/api/tasks/[taskId]/complete/route.ts
// for the simulated path the demo UI actually uses.
//
// Expected query params:
//   user_id=<uuid>&task_id=<uuid>&transaction_id=<network id>&signature=<hex hmac>

export async function GET(req: Request) {
  const url = new URL(req.url);
  const signature = url.searchParams.get("signature");
  const signedPayload = buildSignedPayload(url);

  if (!signature || !verifySignature(signedPayload, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const userId = url.searchParams.get("user_id");
  const taskId = url.searchParams.get("task_id");
  const transactionId = url.searchParams.get("transaction_id");

  if (!userId || !taskId || !transactionId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    const log = await completeTask(userId, taskId, `ad:${transactionId}`, {
      type: "ad_view",
      provider: "generic_ssv",
      raw: Object.fromEntries(url.searchParams),
    });
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    if (err instanceof RpcError && err.message.includes("duplicate")) {
      // The ad network retries on non-2xx; treat a duplicate as success
      // so it stops retrying.
      return NextResponse.json({ ok: true, note: "already_processed" });
    }
    return rpcErrorResponse(err);
  }
}

function buildSignedPayload(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete("signature");
  params.sort();
  return params.toString();
}

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.AD_NETWORK_SSV_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

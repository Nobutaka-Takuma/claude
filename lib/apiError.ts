import { NextResponse } from "next/server";
import { RpcError, rpcErrorStatus } from "./rpc";

// One place that turns a thrown error into the JSON shape every form on
// the client knows how to read: { error, detail }.
//
// Rethrowing an unexpected error used to hand Next.js's HTML error page to
// a fetch() that only knows how to parse JSON — the form saw a parse
// failure and showed its generic "failed" text, hiding the real cause.
// Everything returns JSON now, so the reason always reaches the screen.
export function rpcErrorResponse(err: unknown): NextResponse {
  if (err instanceof RpcError) {
    return NextResponse.json(
      { error: err.message, detail: err.detail ?? null },
      { status: rpcErrorStatus(err.message) }
    );
  }

  console.error("unexpected API error", err);
  return NextResponse.json(
    { error: "server_error", detail: err instanceof Error ? err.message : String(err) },
    { status: 500 }
  );
}

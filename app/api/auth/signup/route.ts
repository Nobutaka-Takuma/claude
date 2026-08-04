import { NextResponse } from "next/server";
import { z } from "zod";
import { signUp, AuthError } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(24),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const userId = await signUp(parsed.data.email, parsed.data.password, parsed.data.username);
    await setSessionCookie(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

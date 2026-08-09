import { NextResponse } from "next/server";
import { getCurrentProfile } from "./auth";
import type { Profile } from "./types";

// Every operator-only route starts with the same three lines, and getting
// them subtly wrong in one of them is how an admin endpoint ends up open.
// Returns either the profile or the response to send back.
export async function requireAdmin(): Promise<
  { profile: Profile; response?: never } | { profile?: never; response: NextResponse }
> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (profile.role !== "admin") {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { profile };
}

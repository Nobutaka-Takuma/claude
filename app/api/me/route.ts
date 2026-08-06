import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { rpcErrorResponse } from "@/lib/apiError";

// GET /api/me
//
// Just enough of the signed-in user for the header to keep its points
// badge honest. The header lives in the root layout, which Next reuses
// across client-side navigations instead of re-rendering — so a balance
// rendered on the server goes stale the moment you place a bet and move
// to another page.
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ profile: null });
    }
    return NextResponse.json({
      profile: {
        id: profile.id,
        username: profile.username,
        role: profile.role,
        points_balance: Number(profile.points_balance),
      },
    });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

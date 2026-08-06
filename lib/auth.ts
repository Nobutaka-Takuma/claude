import bcrypt from "bcryptjs";
import { query } from "./db";
import { getSessionUserId } from "./session";
import { grantSignupBonus } from "./rpc";
import { SIGNUP_BONUS_POINTS } from "./config";
import type { Profile } from "./types";

export class AuthError extends Error {}

export async function signUp(email: string, password: string, username: string) {
  const emailTaken = await query("select 1 from app_users where email = $1", [email]);
  if (emailTaken.rowCount) throw new AuthError("email_taken");

  const usernameTaken = await query("select 1 from profiles where username = $1", [username]);
  if (usernameTaken.rowCount) throw new AuthError("username_taken");

  const passwordHash = await bcrypt.hash(password, 10);

  // Single statement so the credentials row and its profiles row are
  // created atomically — no separate BEGIN/COMMIT needed.
  const result = await query<{ id: string }>(
    `with new_user as (
       insert into app_users (email, encrypted_password)
       values ($1, $2)
       returning id
     )
     insert into profiles (id, username)
     select id, $3 from new_user
     returning id`,
    [email, passwordHash, username]
  );

  const userId = result.rows[0].id;

  // Welcome points. Deliberately not fatal: an account that exists with
  // no bonus is recoverable, a signup that 500s after creating the row
  // is not.
  try {
    await grantSignupBonus(userId, SIGNUP_BONUS_POINTS());
  } catch (err) {
    console.error("signup bonus failed", err);
  }

  return userId;
}

export async function login(email: string, password: string) {
  const result = await query<{ id: string; encrypted_password: string }>(
    "select id, encrypted_password from app_users where email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user) throw new AuthError("invalid_credentials");

  const valid = await bcrypt.compare(password, user.encrypted_password);
  if (!valid) throw new AuthError("invalid_credentials");

  return user.id;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const result = await query<Profile>("select * from profiles where id = $1", [userId]);
  return result.rows[0] ?? null;
}

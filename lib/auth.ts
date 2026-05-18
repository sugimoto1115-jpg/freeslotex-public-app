import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { query } from "@/lib/db";

const SESSION_COOKIE_NAME = "labtex_session";
const SESSION_TTL_DAYS = 30;

export type AuthUser = {
  email: string;
  displayName: string | null;
};

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;

  const derived = scryptSync(password, salt, 64);
  const key = Buffer.from(keyHex, "hex");

  if (key.length !== derived.length) return false;
  return timingSafeEqual(key, derived);
}

function hashSessionToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${rawToken}`)
    .digest("hex");
}

export function makeSessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userEmail: string): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  const rawToken = randomBytes(32).toString("base64url");
  const sessionTokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await query(
    `
    INSERT INTO user_sessions (session_token_hash, user_email, expires_at)
    VALUES ($1, $2, $3)
    `,
    [sessionTokenHash, normalizeEmail(userEmail), expiresAt],
  );

  return { rawToken, expiresAt };
}

export async function deleteSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;

  const sessionTokenHash = hashSessionToken(rawToken);

  await query(
    `
    DELETE FROM user_sessions
    WHERE session_token_hash = $1
    `,
    [sessionTokenHash],
  );
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) return null;

  const sessionTokenHash = hashSessionToken(rawToken);

  const result = await query<{
    email: string;
    display_name: string | null;
  }>(
    `
    SELECT u.email, u.display_name
    FROM user_sessions s
    JOIN users u
      ON lower(u.email) = lower(s.user_email)
    WHERE s.session_token_hash = $1
      AND s.expires_at > now()
    LIMIT 1
    `,
    [sessionTokenHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  await query(
    `
    UPDATE user_sessions
    SET last_seen_at = now()
    WHERE session_token_hash = $1
    `,
    [sessionTokenHash],
  );

  return {
    email: row.email,
    displayName: row.display_name,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export function validateEmail(email: string): string | null {
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return null;
  }
  return normalized;
}

export function validatePassword(password: string): string | null {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return "パスワードは8文字以上にしてください。";
  }
  if (trimmed.length > 200) {
    return "パスワードが長すぎます。";
  }
  return null;
}

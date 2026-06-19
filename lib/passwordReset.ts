import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

const RESET_TOKEN_TTL_MINUTES = 30;

let tableEnsured = false;

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return secret;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashResetToken(rawToken: string) {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${rawToken}`)
    .digest("hex");
}

export async function ensurePasswordResetTokenTable() {
  if (tableEnsured) return;

  await query(`
    create table if not exists password_reset_tokens (
      id bigserial primary key,
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create index if not exists password_reset_tokens_email_created_idx
    on password_reset_tokens (lower(email), created_at desc)
  `);

  await query(`
    create index if not exists password_reset_tokens_valid_idx
    on password_reset_tokens (token_hash)
    where used_at is null
  `);

  tableEnsured = true;
}

export async function createPasswordResetToken(email: string) {
  await ensurePasswordResetTokenTable();

  const normalizedEmail = normalizeEmail(email);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await query(
    `
    update password_reset_tokens
    set used_at = now()
    where lower(email) = lower($1)
      and used_at is null
    `,
    [normalizedEmail],
  );

  await query(
    `
    insert into password_reset_tokens (email, token_hash, expires_at)
    values ($1, $2, $3)
    `,
    [normalizedEmail, tokenHash, expiresAt],
  );

  return {
    rawToken,
    expiresAt,
    ttlMinutes: RESET_TOKEN_TTL_MINUTES,
  };
}

export type PasswordResetTokenInfo = {
  email: string;
  expiresAt: Date | string;
};

export async function getPasswordResetTokenInfo(
  rawToken: string,
): Promise<PasswordResetTokenInfo | null> {
  await ensurePasswordResetTokenTable();

  const token = rawToken.trim();
  if (!token) return null;

  const tokenHash = hashResetToken(token);

  const result = await query<{
    email: string;
    expires_at: Date | string;
  }>(
    `
    select email, expires_at
    from password_reset_tokens
    where token_hash = $1
      and used_at is null
      and expires_at > now()
    limit 1
    `,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    email: row.email,
    expiresAt: row.expires_at,
  };
}

export async function consumePasswordResetToken(
  rawToken: string,
): Promise<PasswordResetTokenInfo | null> {
  await ensurePasswordResetTokenTable();

  const token = rawToken.trim();
  if (!token) return null;

  const tokenHash = hashResetToken(token);

  const result = await query<{
    email: string;
    expires_at: Date | string;
  }>(
    `
    update password_reset_tokens
    set used_at = now()
    where token_hash = $1
      and used_at is null
      and expires_at > now()
    returning email, expires_at
    `,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    email: row.email,
    expiresAt: row.expires_at,
  };
}


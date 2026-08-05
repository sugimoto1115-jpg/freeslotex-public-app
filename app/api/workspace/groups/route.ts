import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = {
  id: number | string;
};

type WorkspaceSortKey = "project" | "name" | "created" | "updated";

class WorkspaceGroupActionError extends Error {
  constructor(readonly actionCode: string) {
    super(actionCode);
  }
}

function makeUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.includes("freeslot-schedule.com") ? "https" : "http");

  return new URL(pathname, `${proto}://${host}`);
}

function normalizeWorkspaceSort(
  value: FormDataEntryValue | null,
): WorkspaceSortKey {
  const raw = String(value ?? "").trim();

  if (
    raw === "project" ||
    raw === "name" ||
    raw === "created" ||
    raw === "updated"
  ) {
    return raw;
  }

  return "updated";
}

function redirectWorkspace(
  request: NextRequest,
  sort: WorkspaceSortKey,
  search: Record<string, string>,
) {
  const url = makeUrl(request, "/workspace");

  if (sort !== "updated") {
    url.searchParams.set("sort", sort);
  }

  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

function normalizeGroupName(value: FormDataEntryValue | null) {
  const name = String(value ?? "").trim();

  if (
    !name ||
    Array.from(name).length > 100 ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    return null;
  }

  return name;
}

function parsePositiveId(value: FormDataEntryValue | null) {
  const id = Number(String(value ?? "").trim());

  return Number.isInteger(id) && id > 0 ? id : null;
}

function databaseErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String((error as { code?: unknown }).code ?? "");
  }

  return "";
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "").trim();
  const sort = normalizeWorkspaceSort(formData.get("sort"));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query<UserRow>(
      `
        select id
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [currentUser.email],
    );

    if (userResult.rows.length === 0) {
      throw new WorkspaceGroupActionError("forbidden");
    }

    const userId = Number(userResult.rows[0].id);
    let success: Record<string, string>;

    if (action === "create") {
      const name = normalizeGroupName(formData.get("name"));

      if (!name) {
        throw new WorkspaceGroupActionError("invalid_name");
      }

      await client.query(
        `
          insert into workspace_project_groups (
            user_id,
            name,
            created_at,
            updated_at
          )
          values ($1, $2, now(), now())
        `,
        [userId, name],
      );

      success = { group_created: "1" };
    } else if (action === "rename") {
      const groupId = parsePositiveId(formData.get("groupId"));
      const name = normalizeGroupName(formData.get("name"));

      if (!groupId) {
        throw new WorkspaceGroupActionError("invalid_group");
      }

      if (!name) {
        throw new WorkspaceGroupActionError("invalid_name");
      }

      const updated = await client.query<{ id: number | string }>(
        `
          update workspace_project_groups
          set name = $1,
              updated_at = now()
          where id = $2
            and user_id = $3
          returning id
        `,
        [name, groupId, userId],
      );

      if (updated.rows.length !== 1) {
        throw new WorkspaceGroupActionError("not_found");
      }

      success = { group_renamed: "1" };
    } else if (action === "delete") {
      const groupId = parsePositiveId(formData.get("groupId"));

      if (!groupId) {
        throw new WorkspaceGroupActionError("invalid_group");
      }

      const deleted = await client.query<{ id: number | string }>(
        `
          delete from workspace_project_groups
          where id = $1
            and user_id = $2
          returning id
        `,
        [groupId, userId],
      );

      if (deleted.rows.length !== 1) {
        throw new WorkspaceGroupActionError("not_found");
      }

      success = { group_deleted: "1" };
    } else {
      throw new WorkspaceGroupActionError("invalid_action");
    }

    await client.query("COMMIT");

    return redirectWorkspace(request, sort, success);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    let errorCode =
      error instanceof WorkspaceGroupActionError
        ? error.actionCode
        : "failed";

    const pgCode = databaseErrorCode(error);

    if (pgCode === "23505") {
      errorCode = "duplicate_name";
    } else if (pgCode === "23514") {
      errorCode = "invalid_name";
    }

    if (errorCode === "failed") {
      console.error("POST /api/workspace/groups failed:", error);
    }

    return redirectWorkspace(request, sort, {
      group_error: errorCode,
    });
  } finally {
    client.release();
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = {
  id: number | string;
};

type ProjectMembershipRow = {
  project_id: number | string;
};

type WorkspaceSortKey = "project" | "name" | "created" | "updated";

class WorkspaceMoveError extends Error {
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

function parseProjectIds(values: FormDataEntryValue[]) {
  const ids = values
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return Array.from(new Set(ids));
}

function parseOptionalGroupId(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const id = Number(raw);

  if (!Number.isInteger(id) || id <= 0) {
    throw new WorkspaceMoveError("invalid_group");
  }

  return id;
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
  const sort = normalizeWorkspaceSort(formData.get("sort"));
  const projectIds = parseProjectIds(formData.getAll("projectId"));

  if (projectIds.length === 0) {
    return redirectWorkspace(request, sort, {
      group_error: "no_projects",
    });
  }

  if (projectIds.length > 500) {
    return redirectWorkspace(request, sort, {
      group_error: "too_many_projects",
    });
  }

  let groupId: number | null;

  try {
    groupId = parseOptionalGroupId(formData.get("groupId"));
  } catch (error) {
    const errorCode =
      error instanceof WorkspaceMoveError
        ? error.actionCode
        : "invalid_group";

    return redirectWorkspace(request, sort, {
      group_error: errorCode,
    });
  }

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
      throw new WorkspaceMoveError("forbidden");
    }

    const userId = Number(userResult.rows[0].id);

    const membershipResult =
      await client.query<ProjectMembershipRow>(
        `
          select pm.project_id
          from project_members pm
          inner join projects p
            on p.id = pm.project_id
          where pm.user_id = $1
            and pm.project_id = any($2::bigint[])
            and p.status = 'active'
        `,
        [userId, projectIds],
      );

    if (membershipResult.rows.length !== projectIds.length) {
      throw new WorkspaceMoveError("forbidden_project");
    }

    if (groupId !== null) {
      const groupResult = await client.query<{ id: number | string }>(
        `
          select id
          from workspace_project_groups
          where id = $1
            and user_id = $2
          limit 1
        `,
        [groupId, userId],
      );

      if (groupResult.rows.length !== 1) {
        throw new WorkspaceMoveError("group_not_found");
      }

      await client.query(
        `
          insert into workspace_project_group_items (
            user_id,
            project_id,
            group_id,
            created_at,
            updated_at
          )
          select
            $1,
            selected.project_id,
            $3,
            now(),
            now()
          from unnest($2::bigint[]) as selected(project_id)
          on conflict (user_id, project_id)
          do update
          set group_id = excluded.group_id,
              updated_at = now()
        `,
        [userId, projectIds, groupId],
      );
    } else {
      await client.query(
        `
          delete from workspace_project_group_items
          where user_id = $1
            and project_id = any($2::bigint[])
        `,
        [userId, projectIds],
      );
    }

    await client.query("COMMIT");

    return redirectWorkspace(request, sort, {
      group_moved: String(projectIds.length),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    let errorCode =
      error instanceof WorkspaceMoveError
        ? error.actionCode
        : "move_failed";

    const pgCode = databaseErrorCode(error);

    if (pgCode === "23503") {
      errorCode = "invalid_membership";
    }

    if (errorCode === "move_failed") {
      console.error("POST /api/workspace/groups/move failed:", error);
    }

    return redirectWorkspace(request, sort, {
      group_error: errorCode,
    });
  } finally {
    client.release();
  }
}

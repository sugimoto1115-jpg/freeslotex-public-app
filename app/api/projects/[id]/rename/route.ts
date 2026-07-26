import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectRow = {
  id: number;
  owner_user_id: number;
  status: string;
};

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

function redirectToProject(
  request: NextRequest,
  projectId: string,
  search: Record<string, string>,
) {
  const url = makeUrl(request, `/projects/${projectId}`);

  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

function normalizeProjectName(value: FormDataEntryValue | null) {
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

export async function POST(
  request: NextRequest,
  { params }: Params,
) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectToProject(request, id, {
      rename_error: "not_found",
    });
  }

  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const formData = await request.formData();
  const projectName = normalizeProjectName(formData.get("name"));

  if (!projectName) {
    return redirectToProject(request, id, {
      rename_error: "invalid_name",
    });
  }

  const userResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email],
  );

  if (userResult.rows.length === 0) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserId = Number(userResult.rows[0].id);

  const projectResult = await query<ProjectRow>(
    `
      select id, owner_user_id, status
      from projects
      where id = $1
      limit 1
    `,
    [projectId],
  );

  if (projectResult.rows.length === 0) {
    return redirectToProject(request, id, {
      rename_error: "not_found",
    });
  }

  const project = projectResult.rows[0];

  if (Number(project.owner_user_id) !== currentUserId) {
    return redirectToProject(request, id, {
      rename_error: "not_owner",
    });
  }

  if (project.status !== "active") {
    return redirectToProject(request, id, {
      rename_error: "not_active",
    });
  }

  const updatedResult = await query<{ id: number }>(
    `
      update projects
      set name = $1,
          updated_at = now()
      where id = $2
        and owner_user_id = $3
        and status = 'active'
      returning id
    `,
    [projectName, projectId, currentUserId],
  );

  if (updatedResult.rows.length !== 1) {
    return redirectToProject(request, id, {
      rename_error: "failed",
    });
  }

  return redirectToProject(request, id, {
    renamed: "1",
  });
}

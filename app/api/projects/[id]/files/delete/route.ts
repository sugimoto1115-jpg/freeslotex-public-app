import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { stat, unlink } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectAccessRow = {
  id: number;
  storage_path: string;
  owner_user_id: number;
  my_role: "owner" | "editor" | "viewer" | null;
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

function redirectToProject(request: NextRequest, projectId: string, search: Record<string, string>) {
  const url = makeUrl(request, `/projects/${projectId}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function resolveProjectDir(storagePath: string) {
  const root = path.resolve(getWorkspacesRoot());
  const full = path.resolve(root, storagePath);

  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Resolved project path is outside LABTEX_WORKSPACES_ROOT.");
  }

  return full;
}

function normalizeRelativePath(value: string | null | undefined) {
  const raw = (value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = raw.split("/");

  if (
    !raw ||
    raw.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid file path.");
  }

  return raw;
}

function resolveProjectFile(projectDir: string, relativePath: string) {
  const full = path.resolve(projectDir, relativePath);

  if (full !== projectDir && !full.startsWith(projectDir + path.sep)) {
    throw new Error("Resolved file path is outside project directory.");
  }

  return full;
}

async function getProjectForUser(projectId: number, currentUserId: number) {
  const projectResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
        p.storage_path,
        p.owner_user_id,
        case
          when p.owner_user_id = $2 then 'owner'
          else pm.role
        end as my_role
      from projects p
      left join project_members pm
        on pm.project_id = p.id
       and pm.user_id = $2
      where p.id = $1
        and p.status = 'active'
        and (
          p.owner_user_id = $2
          or pm.user_id is not null
        )
      limit 1
    `,
    [projectId, currentUserId]
  );

  return projectResult.rows[0] ?? null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectToProject(request, id, { error: "bad_project" });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const userResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserId = Number(userResult.rows[0].id);
  const project = await getProjectForUser(projectId, currentUserId);

  if (!project) {
    return redirectToProject(request, id, { error: "forbidden" });
  }

  const canEdit = project.my_role === "owner" || project.my_role === "editor";
  if (!canEdit) {
    return redirectToProject(request, id, { error: "readonly" });
  }

  const formData = await request.formData().catch(() => null);
  const fileSort =
    typeof formData?.get("fileSort") === "string" ? String(formData.get("fileSort")) : "";

  const relativePathValues = (formData?.getAll("relativePath") ?? []).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  function redirectWithSort(search: Record<string, string>) {
    if (fileSort) search.fileSort = fileSort;
    return redirectToProject(request, id, search);
  }

  if (relativePathValues.length === 0) {
    return redirectWithSort({ error: "bad_path" });
  }

  if (relativePathValues.length > 200) {
    return redirectWithSort({ error: "too_many_files" });
  }

  const relativePaths: string[] = [];

  try {
    for (const value of relativePathValues) {
      relativePaths.push(normalizeRelativePath(value));
    }
  } catch {
    return redirectWithSort({ error: "bad_path" });
  }

  const seenRelativePaths = new Set<string>();

  for (const relativePath of relativePaths) {
    if (seenRelativePaths.has(relativePath)) {
      return redirectWithSort({ error: "bad_path" });
    }

    seenRelativePaths.add(relativePath);
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const preparedFiles = relativePaths.map((relativePath) => ({
    relativePath,
    targetPath: resolveProjectFile(projectDir, relativePath),
  }));

  for (const prepared of preparedFiles) {
    const st = await stat(prepared.targetPath).catch(() => null);

    if (!st || !st.isFile()) {
      return redirectWithSort({ error: "not_file" });
    }
  }

  for (const prepared of preparedFiles) {
    await unlink(prepared.targetPath);
  }

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId]
  );

  return redirectWithSort({
    deleted:
      preparedFiles.length === 1
        ? preparedFiles[0].relativePath
        : `${preparedFiles.length} files`,
  });
}

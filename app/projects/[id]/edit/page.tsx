import { notFound, redirect } from "next/navigation";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import TexEditorClient from "./TexEditorClient";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type UserRow = {
  id: number;
};

type ProjectAccessRow = {
  id: number;
  name: string;
  storage_path: string;
  owner_user_id: number;
  my_role: "owner" | "editor" | "viewer" | null;
};

type OutlineItem = {
  level: string;
  title: string;
  line: number;
};

type WorkspaceEntry = {
  relativePath: string;
  name: string;
  kind: "dir" | "file";
  size: number | null;
  updatedAt: string | null;
  depth: number;
};

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

function parseOutline(tex: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const re = /\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]*)\}/g;

  for (const match of tex.matchAll(re)) {
    const index = match.index ?? 0;
    const before = tex.slice(0, index);
    const line = before.length === 0 ? 1 : before.split(/\r\n|\r|\n/).length;

    items.push({
      level: match[1],
      title: match[2],
      line,
    });
  }

  return items;
}

function roleLabel(role: string | null) {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "Unknown";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tail(text: string, lines = 140) {
  const xs = text.split(/\r\n|\r|\n/);
  return xs.slice(Math.max(0, xs.length - lines)).join("\n");
}

async function collectWorkspaceEntries(
  baseDir: string,
  maxDepth = 3,
  maxItems = 250
): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];

  async function walk(currentDir: string, depth: number) {
    if (entries.length >= maxItems) return;

    const dirents = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    dirents.sort((a, b) => {
      const ar = a.isDirectory() ? 0 : 1;
      const br = b.isDirectory() ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });

    for (const dirent of dirents) {
      if (entries.length >= maxItems) return;

      const absolutePath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, "/");
      const st = await stat(absolutePath).catch(() => null);

      entries.push({
        relativePath,
        name: dirent.name,
        kind: dirent.isDirectory() ? "dir" : "file",
        size: dirent.isDirectory() ? null : st?.size ?? null,
        updatedAt: st?.mtime ? st.mtime.toISOString() : null,
        depth,
      });

      if (dirent.isDirectory() && depth < maxDepth) {
        await walk(absolutePath, depth + 1);
      }
    }
  }

  await walk(baseDir, 0);
  return entries;
}

export default async function ProjectEditPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    notFound();
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    redirect("/login");
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
    redirect("/login");
  }

  const currentUserId = Number(userResult.rows[0].id);

  const projectResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
        p.name,
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

  if (projectResult.rows.length === 0) {
    notFound();
  }

  const project = projectResult.rows[0];
  const projectDir = resolveProjectDir(project.storage_path);
  const mainTexPath = path.join(projectDir, "main.tex");
  const mainPdfPath = path.join(projectDir, "main.pdf");
  const texLogPath = path.join(projectDir, "main.log");
  const fsxLogPath = path.join(projectDir, "freeslotex-compile.log");
  const errorSummaryPath = path.join(projectDir, "freeslotex-error-summary.txt");

  let mainTex = "";
  let fileMessage: string | null = null;

  try {
    mainTex = await readFile(mainTexPath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      fileMessage = "main.tex was not found in this project.";
    } else {
      throw error;
    }
  }

  const files = await collectWorkspaceEntries(projectDir).catch(() => []);
  const pdfExists = await stat(mainPdfPath).then(() => true).catch(() => false);
  const texLog = await readFile(texLogPath, "utf8").catch(() => "");
  const fsxLog = await readFile(fsxLogPath, "utf8").catch(() => "");
  const errorSummary = await readFile(errorSummaryPath, "utf8").catch(() => "");

  const outline = parseOutline(mainTex);
  const canEdit = project.my_role === "owner" || project.my_role === "editor";

  return (
    <TexEditorClient
      projectId={project.id}
      projectName={project.name}
      roleLabel={roleLabel(project.my_role)}
      canEdit={canEdit}
      mainTex={mainTex}
      fileMessage={fileMessage}
      outline={outline}
      files={files}
      pdfExists={pdfExists}
      saved={firstParam(sp.saved) === "1"}
      compiled={firstParam(sp.compiled) === "1"}
      engine={firstParam(sp.engine)}
      saveError={firstParam(sp.error)}
      compileError={firstParam(sp.compile_error)}
      compileErrorSummary={tail(errorSummary, 100)}
      fsxLogTail={tail(fsxLog, 120)}
      texLogTail={tail(texLog, 120)}
    />
  );
}

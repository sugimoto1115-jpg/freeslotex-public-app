import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

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

function redirectToEdit(request: NextRequest, projectId: string, search: Record<string, string>) {
  const url = makeUrl(request, `/projects/${projectId}/edit`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

function detectCompileScript(tex: string) {
  const cls = tex.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";

  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tex);

  if (/^ltjs(article|book|report)$/.test(cls) || tex.includes("\\usepackage{luatexja}")) {
    return {
      engine: "lualatex",
      script: "latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error main.tex",
    };
  }

  if (/^(u)?p?js(article|book|report)$/.test(cls) || /^(jarticle|jbook|jreport)$/.test(cls)) {
    return {
      engine: "uplatex+dvipdfmx",
      script:
        "latexmk -C || true; latexmk -pdfdvi -latex='uplatex -interaction=nonstopmode -halt-on-error %O %S' -dvipdf='dvipdfmx %O -o %D %S' main.tex",
    };
  }

  if (hasJapaneseOrFullwidth) {
    return {
      engine: "lualatex-auto-unicode",
      script: "latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error main.tex",
    };
  }

  return {
    engine: "pdflatex",
    script: "latexmk -C || true; latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex",
  };
}



function extractLatexErrorSummary(text: string) {
  const lines = text.split(/\r\n|\r|\n/);

  const patterns = [
    /^! /,
    /LaTeX Error:/,
    /Package .* Error:/,
    /Undefined control sequence/,
    /Emergency stop/,
    /Fatal error occurred/,
    /Missing .* inserted/,
    /File .* not found/,
    /Runaway argument/,
    /No pages of output/,
    /Command .* returned with error/,
  ];

  const hit = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));

  if (hit >= 0) {
    const start = Math.max(0, hit - 8);
    const end = Math.min(lines.length, hit + 24);
    return [
      "FreeSloTeX compile error summary",
      "",
      "First likely error:",
      "",
      ...lines.slice(start, end),
      "",
      "Hint:",
      "Check the line beginning with `!` and the nearby `l.<number>` line.",
    ].join("\n").slice(0, 16000);
  }

  return [
    "FreeSloTeX compile error summary",
    "",
    "No standard LaTeX error pattern was found.",
    "Showing the last part of the compile output:",
    "",
    ...lines.slice(-120),
  ].join("\n").slice(0, 16000);
}

async function getProjectForEdit(projectId: number, currentUserId: number) {
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
    return redirectToEdit(request, id, { compile_error: "bad_project" });
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
  const project = await getProjectForEdit(projectId, currentUserId);

  if (!project) {
    return redirectToEdit(request, id, { compile_error: "forbidden" });
  }

  const canCompile = project.my_role === "owner" || project.my_role === "editor";
  if (!canCompile) {
    return redirectToEdit(request, id, { compile_error: "readonly" });
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const mainTexPath = path.join(projectDir, "main.tex");

  let tex = "";
  try {
    tex = await readFile(mainTexPath, "utf8");
  } catch {
    return redirectToEdit(request, id, { compile_error: "missing_main" });
  }

  const { engine, script } = detectCompileScript(tex);

  // Remove stale PDF before compile so a failed compile never leaves an old PDF visible.
  await rm(path.join(projectDir, "main.pdf"), { force: true }).catch(() => {});

  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    `${uid}:${gid}`,
    "--entrypoint",
    "/bin/bash",
    "-v",
    `${projectDir}:/work`,
    "-w",
    "/work",
    "texcode-texlive:1",
    "-lc",
    script,
  ];

  const startedAt = new Date();

  try {
    const result = await execFileAsync("docker", args, {
      timeout: 120_000,
      maxBuffer: 3 * 1024 * 1024,
    });

    const log = [
      `FreeSloTeX compile`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      ``,
      `===== stdout =====`,
      result.stdout ?? "",
      ``,
      `===== stderr =====`,
      result.stderr ?? "",
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8");
    await rm(path.join(projectDir, "freeslotex-error-summary.txt"), { force: true }).catch(() => {});

    await query(
      `
        update projects
        set updated_at = now()
        where id = $1
      `,
      [projectId]
    );

    return redirectToEdit(request, id, { compiled: "1", engine });
  } catch (error: any) {
    const log = [
      `FreeSloTeX compile failed`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      `message: ${String(error?.message ?? error)}`,
      ``,
      `===== stdout =====`,
      String(error?.stdout ?? ""),
      ``,
      `===== stderr =====`,
      String(error?.stderr ?? ""),
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8").catch(() => {});

    const texLogAfterFailure = await readFile(path.join(projectDir, "main.log"), "utf8").catch(() => "");
    const errorSummary = extractLatexErrorSummary(
      [
        String(error?.stdout ?? ""),
        String(error?.stderr ?? ""),
        texLogAfterFailure,
      ].join("\n")
    );

    await writeFile(
      path.join(projectDir, "freeslotex-error-summary.txt"),
      errorSummary,
      "utf8"
    ).catch(() => {});

    // Ensure stale PDF is not downloadable after failed compile.
    await rm(path.join(projectDir, "main.pdf"), { force: true }).catch(() => {});

    if (String(error?.message ?? "").includes("timed out")) {
      return redirectToEdit(request, id, { compile_error: "timeout" });
    }

    return redirectToEdit(request, id, { compile_error: "failed" });
  }
}

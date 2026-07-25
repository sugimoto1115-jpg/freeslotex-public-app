import { randomUUID } from "node:crypto";
import path from "node:path";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type TargetUserRow = {
  id: number;
  email: string;
};

type OwnedProjectRow = {
  id: number;
  storage_path: string;
};

type MovedPath = {
  source: string;
  quarantine: string;
};

function makeUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto = request.headers.get("x-forwarded-proto") ?? "https";

  return new URL(pathname, `${proto}://${host}`);
}

function redirectToAdmin(
  request: NextRequest,
  params: Record<string, string>,
) {
  const url = makeUrl(request, "/admin/freeslotex");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

function workspacesRoot() {
  return path.resolve(
    process.env.LABTEX_WORKSPACES_ROOT ||
      "/home/tomoyuki/labtex/workspaces",
  );
}

function userEditorsRoot() {
  return path.resolve("/home/tomoyuki/freeslotex-user-editors");
}

function resolveWorkspacePath(storagePath: string) {
  const root = workspacesRoot();
  const resolved = path.isAbsolute(storagePath)
    ? path.resolve(storagePath)
    : path.resolve(root, storagePath);

  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    throw new Error("bad_storage_path");
  }

  return resolved;
}

async function pathExists(targetPath: string) {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function moveToQuarantine(
  source: string,
  quarantine: string,
  movedPaths: MovedPath[],
) {
  if (!(await pathExists(source))) return;

  await mkdir(path.dirname(quarantine), { recursive: true });
  await rename(source, quarantine);

  movedPaths.push({
    source,
    quarantine,
  });
}

async function restoreMovedPaths(movedPaths: MovedPath[]) {
  let restored = true;

  for (const moved of [...movedPaths].reverse()) {
    try {
      if (!(await pathExists(moved.quarantine))) continue;

      await mkdir(path.dirname(moved.source), { recursive: true });
      await rename(moved.quarantine, moved.source);
    } catch (error) {
      restored = false;
      console.error("Failed to restore quarantined path", moved, error);
    }
  }

  return restored;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return redirectToAdmin(request, { error: "login_required" });
  }

  const currentPlan = await getEffectiveFsPlanForEmail(currentUser.email);

  if (currentPlan !== "admin") {
    return redirectToAdmin(request, { error: "admin_required" });
  }

  const formData = await request.formData();
  const targetUserId = Number(formData.get("userId"));
  const confirmationEmail = String(
    formData.get("confirmEmail") ?? "",
  )
    .trim()
    .toLowerCase();

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return redirectToAdmin(request, { error: "invalid_user_id" });
  }

  const client = await pool.connect();
  const movedPaths: MovedPath[] = [];
  const batchId = `${Date.now()}-${randomUUID()}`;

  const workspaceRoot = workspacesRoot();
  const workspaceQuarantineRoot = path.join(
    workspaceRoot,
    ".account-delete-quarantine",
    batchId,
  );

  const editorsRoot = userEditorsRoot();
  const editorQuarantineRoot = path.join(
    editorsRoot,
    ".account-delete-quarantine",
    batchId,
  );

  let committed = false;
  let targetEmail = "";

  try {
    await client.query("BEGIN");

    const targetResult = await client.query<TargetUserRow>(
      `
        select id, email
        from users
        where id = $1
        for update
      `,
      [targetUserId],
    );

    if (targetResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return redirectToAdmin(request, {
        error: "target_user_not_found",
      });
    }

    const target = targetResult.rows[0];
    targetEmail = target.email;

    if (
      !confirmationEmail ||
      confirmationEmail !== targetEmail.trim().toLowerCase()
    ) {
      await client.query("ROLLBACK");
      return redirectToAdmin(request, {
        error: "confirmation_email_mismatch",
      });
    }

    if (
      targetEmail.trim().toLowerCase() ===
      currentUser.email.trim().toLowerCase()
    ) {
      await client.query("ROLLBACK");
      return redirectToAdmin(request, {
        error: "cannot_delete_current_account",
      });
    }

    const targetPlan = await getEffectiveFsPlanForEmail(targetEmail);

    if (targetPlan === "admin") {
      await client.query("ROLLBACK");
      return redirectToAdmin(request, {
        error: "cannot_delete_admin",
      });
    }

    const projectResult = await client.query<OwnedProjectRow>(
      `
        select id, storage_path
        from projects
        where owner_user_id = $1
        order by id
        for update
      `,
      [targetUserId],
    );

    /*
     * New projects are normally stored below projects/<user-id>.
     * Moving the whole user directory also removes orphaned files
     * that are no longer represented by a projects table row.
     */
    const userProjectRoot = path.join(
      workspaceRoot,
      "projects",
      String(targetUserId),
    );

    await moveToQuarantine(
      userProjectRoot,
      path.join(workspaceQuarantineRoot, "user-project-root"),
      movedPaths,
    );

    /*
     * Also handle older or exceptional project paths that are not
     * located below projects/<user-id>.
     */
    for (const project of projectResult.rows) {
      const source = resolveWorkspacePath(project.storage_path);

      if (
        source === userProjectRoot ||
        source.startsWith(userProjectRoot + path.sep)
      ) {
        continue;
      }

      await moveToQuarantine(
        source,
        path.join(
          workspaceQuarantineRoot,
          `project-${project.id}`,
        ),
        movedPaths,
      );
    }

    const userEditorRoot = path.join(
      editorsRoot,
      `user-${targetUserId}`,
    );

    await moveToQuarantine(
      userEditorRoot,
      path.join(
        editorQuarantineRoot,
        `user-${targetUserId}`,
      ),
      movedPaths,
    );

    /*
     * Remove references that do not use ON DELETE CASCADE.
     */
    await client.query(
      `
        delete from share_links
        where created_by_user_id = $1
      `,
      [targetUserId],
    );

    await client.query(
      `
        update project_members
        set invited_by_user_id = null,
            updated_at = now()
        where invited_by_user_id = $1
      `,
      [targetUserId],
    );

    /*
     * Membership rows for the target user would cascade, but they are
     * deleted explicitly so the operation remains easy to audit.
     */
    await client.query(
      `
        delete from project_members
        where user_id = $1
      `,
      [targetUserId],
    );

    /*
     * Deleting owned projects cascades their project_members and
     * share_links rows.
     */
    await client.query(
      `
        delete from projects
        where owner_user_id = $1
      `,
      [targetUserId],
    );

    await client.query(
      `
        delete from user_sessions
        where lower(user_email) = lower($1)
      `,
      [targetEmail],
    );

    await client.query(
      `
        delete from password_reset_tokens
        where lower(email) = lower($1)
      `,
      [targetEmail],
    );

    await client.query(
      `
        delete from freeslotex_user_plans
        where lower(email) = lower($1)
      `,
      [targetEmail],
    );

    await client.query(
      `
        delete from freeslotex_compile_usage
        where lower(email) = lower($1)
      `,
      [targetEmail],
    );

    const deletedUserResult = await client.query<{ email: string }>(
      `
        delete from users
        where id = $1
        returning email
      `,
      [targetUserId],
    );

    if (deletedUserResult.rows.length !== 1) {
      throw new Error("user_delete_failed");
    }

    await client.query("COMMIT");
    committed = true;

    const cleanupResults = await Promise.allSettled([
      rm(workspaceQuarantineRoot, {
        recursive: true,
        force: true,
      }),
      rm(editorQuarantineRoot, {
        recursive: true,
        force: true,
      }),
    ]);

    const cleanupFailed = cleanupResults.some(
      (result) => result.status === "rejected",
    );

    if (cleanupFailed) {
      console.error(
        "Account deleted, but quarantine cleanup failed",
        cleanupResults,
      );

      return redirectToAdmin(request, {
        deleted: targetEmail,
        cleanup: "pending",
      });
    }

    return redirectToAdmin(request, {
      deleted: targetEmail,
    });
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK").catch(() => {});
    }

    const restored = committed
      ? true
      : await restoreMovedPaths(movedPaths);

    console.error("Admin account deletion failed", {
      targetUserId,
      targetEmail,
      movedPaths,
      restored,
      error,
    });

    if (!restored) {
      return redirectToAdmin(request, {
        error: "delete_failed_restore_required",
      });
    }

    const message =
      error instanceof Error ? error.message : "delete_failed";

    return redirectToAdmin(request, {
      error:
        message === "bad_storage_path"
          ? "invalid_project_storage_path"
          : "delete_failed",
    });
  } finally {
    client.release();
  }
}

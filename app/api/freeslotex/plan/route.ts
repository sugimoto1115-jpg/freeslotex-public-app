import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fsPlanLabel } from "@/lib/freeslotex/entitlements";
import { canUseFsFeature, getFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return NextResponse.json(
      { ok: false, error: "login_required" },
      { status: 401 },
    );
  }

  const plan = getFsPlanForEmail(currentUser.email);

  return NextResponse.json({
    ok: true,
    email: currentUser.email,
    plan,
    planLabel: fsPlanLabel(plan),
    features: {
      edit: canUseFsFeature(currentUser.email, "edit").allowed,
      save: canUseFsFeature(currentUser.email, "save").allowed,
      compile: canUseFsFeature(currentUser.email, "compile").allowed,
      upload: canUseFsFeature(currentUser.email, "upload").allowed,
      deleteFile: canUseFsFeature(currentUser.email, "deleteFile").allowed,
      historyRestore: canUseFsFeature(currentUser.email, "historyRestore").allowed,
      checkpoint: canUseFsFeature(currentUser.email, "checkpoint").allowed,
      restoreDeletedFile: canUseFsFeature(currentUser.email, "restoreDeletedFile").allowed,
      labMembers: canUseFsFeature(currentUser.email, "labMembers").allowed,
    },
  });
}

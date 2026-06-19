import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fsPlanLabel, type FsFeature } from "@/lib/freeslotex/entitlements";
import {
  canUseFsFeatureForEmail,
  getEffectiveFsPlanForEmail,
} from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

const FEATURES: FsFeature[] = [
  "edit",
  "save",
  "compile",
  "upload",
  "deleteFile",
  "historyRestore",
  "checkpoint",
  "restoreDeletedFile",
  "labMembers",
];

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return NextResponse.json(
      { ok: false, error: "login_required" },
      { status: 401 },
    );
  }

  const plan = await getEffectiveFsPlanForEmail(currentUser.email);

  const featureEntries = await Promise.all(
    FEATURES.map(async (feature) => {
      const gate = await canUseFsFeatureForEmail(currentUser.email, feature);
      return [feature, gate.allowed] as const;
    }),
  );

  return NextResponse.json({
    ok: true,
    email: currentUser.email,
    plan,
    planLabel: fsPlanLabel(plan),
    features: Object.fromEntries(featureEntries),
  });
}

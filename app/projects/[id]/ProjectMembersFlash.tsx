"use client";

import { useSearchParams } from "next/navigation";

type Flash =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | null;

function resolveFlash(
  okValue: string | null,
  errorValue: string | null,
): Flash {
  if (okValue === "saved") {
    return { kind: "ok", text: "?????????????????" };
  }

  switch (errorValue) {
    case "invalid_email":
      return { kind: "error", text: "????????????????????" };
    case "no_user":
      return { kind: "error", text: "??????????????????????" };
    case "forbidden":
      return { kind: "error", text: "????????????????" };
    case "invalid_role":
      return { kind: "error", text: "???????????????" };
    case "bad_project":
      return { kind: "error", text: "??????ID??????" };
    case "unknown":
      return { kind: "error", text: "??????????????" };
    default:
      return null;
  }
}

export default function ProjectMembersFlash() {
  const searchParams = useSearchParams();
  const flash = resolveFlash(
    searchParams.get("members"),
    searchParams.get("members_error"),
  );

  if (!flash) return null;

  const className =
    flash.kind === "ok"
      ? "rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
      : "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800";

  return <div className={className}>{flash.text}</div>;
}

"use client";

import type { FormEvent } from "react";

type Props = {
  userId: string;
  email: string;
  status: string;
  disabled: boolean;
};

export default function AccountStatusButton({
  userId,
  email,
  status,
  disabled,
}: Props) {
  const normalizedStatus = status.trim().toLowerCase();

  const nextStatus =
    normalizedStatus === "active"
      ? "suspended"
      : normalizedStatus === "suspended"
        ? "active"
        : "";

  const unavailable = disabled || !nextStatus;
  const label =
    disabled
      ? "Protected"
      : nextStatus === "suspended"
        ? "Suspend"
        : nextStatus === "active"
          ? "Enable"
          : "Unavailable";

  function confirmChange(event: FormEvent<HTMLFormElement>) {
    if (unavailable) {
      event.preventDefault();
      return;
    }

    const message =
      nextStatus === "suspended"
        ? [
            `Suspend ${email}?`,
            "",
            "The user will be signed out and will not be able to log in.",
            "Projects and files will remain for investigation.",
          ].join("\n")
        : [
            `Enable ${email}?`,
            "",
            "The user will be allowed to log in again.",
          ].join("\n");

    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <form
      className="fsx-plan-form"
      method="post"
      action="/admin/freeslotex/status"
      onSubmit={confirmChange}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />

      <button
        className="fsx-plan-save"
        type="submit"
        disabled={unavailable}
        title={
          disabled
            ? "The current account and Admin accounts are protected."
            : nextStatus === "suspended"
              ? `Suspend ${email}`
              : nextStatus === "active"
                ? `Enable ${email}`
                : "Unsupported account status"
        }
        style={
          unavailable
            ? {
                cursor: "not-allowed",
                opacity: 0.55,
              }
            : nextStatus === "suspended"
              ? {
                  background: "#b45309",
                  borderColor: "#b45309",
                  color: "#ffffff",
                }
              : {
                  background: "#047857",
                  borderColor: "#047857",
                  color: "#ffffff",
                }
        }
      >
        {label}
      </button>
    </form>
  );
}

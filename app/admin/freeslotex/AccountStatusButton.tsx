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
    normalizedStatus === "pending"
      ? "active"
      : normalizedStatus === "active"
        ? "suspended"
        : normalizedStatus === "suspended"
          ? "active"
          : "";

  const unavailable = disabled || !nextStatus;
  const label =
    disabled
      ? "Protected"
      : normalizedStatus === "pending"
        ? "Approve"
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
      normalizedStatus === "pending"
        ? [
            `Approve ${email}?`,
            "",
            "The account will become active.",
            "An approval email will be sent to the applicant.",
          ].join("\n")
        : nextStatus === "suspended"
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
            : normalizedStatus === "pending"
              ? `Approve ${email}`
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

"use client";

import type { FormEvent } from "react";

type Props = {
  userId: string;
  email: string;
  projectCount: number;
  disabled: boolean;
};

export default function DeleteUserButton({
  userId,
  email,
  projectCount,
  disabled,
}: Props) {
  function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    if (disabled) {
      event.preventDefault();
      return;
    }

    const typedEmail = window.prompt(
      [
        `Delete ${email}?`,
        "",
        `This permanently deletes the account, ${projectCount} owned project(s),`,
        "all project files, sessions, sharing records, and usage records.",
        "",
        "Type the email address exactly to continue:",
      ].join("\n"),
    );

    if (typedEmail === null) {
      event.preventDefault();
      return;
    }

    if (typedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      event.preventDefault();
      window.alert("The email address did not match. Nothing was deleted.");
      return;
    }

    const confirmationInput =
      event.currentTarget.elements.namedItem("confirmEmail");

    if (!(confirmationInput instanceof HTMLInputElement)) {
      event.preventDefault();
      window.alert("Deletion confirmation could not be submitted.");
      return;
    }

    confirmationInput.value = typedEmail.trim();
  }

  return (
    <form
      className="fsx-plan-form"
      method="post"
      action="/admin/freeslotex/delete-user"
      onSubmit={confirmDeletion}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="confirmEmail" defaultValue="" />
      <button
        className="fsx-plan-save"
        type="submit"
        disabled={disabled}
        title={
          disabled
            ? "The current account and Admin accounts are protected."
            : `Delete ${email} and all owned projects`
        }
        style={
          disabled
            ? {
                cursor: "not-allowed",
                opacity: 0.55,
              }
            : {
                background: "#b91c1c",
                borderColor: "#b91c1c",
                color: "#ffffff",
              }
        }
      >
        {disabled ? "Protected" : "Delete"}
      </button>
    </form>
  );
}

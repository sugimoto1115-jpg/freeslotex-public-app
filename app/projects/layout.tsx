import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

export default async function ProjectsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();

  return <div className="fsx-shell">{children}</div>;
}

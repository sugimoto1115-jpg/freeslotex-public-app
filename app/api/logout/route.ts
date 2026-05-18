import { NextRequest, NextResponse } from "next/server";
import { deleteSession, makeSessionCookieOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const rawToken = request.cookies.get("labtex_session")?.value;
    await deleteSession(rawToken);

    const response = NextResponse.redirect(new URL("/login", "http://labtex.freeslot-schedule.com"), 303);
    response.cookies.set({
      ...makeSessionCookieOptions(new Date(0)),
      value: "",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("POST /api/logout failed:", error);

    const response = NextResponse.redirect(new URL("/login", "http://labtex.freeslot-schedule.com"), 303);
    response.cookies.set({
      ...makeSessionCookieOptions(new Date(0)),
      value: "",
      expires: new Date(0),
    });

    return response;
  }
}

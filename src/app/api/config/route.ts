import "server-only";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    emailMode: process.env.EMAIL_MODE === "live" ? "live" : "dry",
    testRecipient: process.env.TEST_RECIPIENT ?? "(unset)",
  });
}

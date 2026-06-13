import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    return NextResponse.redirect(`${origin}/?code=${code}`);
  }
  return NextResponse.redirect(`${origin}/`);
}

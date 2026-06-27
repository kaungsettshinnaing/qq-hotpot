import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  // Reject any path segment that isn't a safe filename token (prevents traversal)
  if (slug.some((s) => /[^a-zA-Z0-9.\-_]/.test(s))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const filePath = path.join(UPLOAD_DIR, ...slug);
  if (!existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const file = readFileSync(filePath);
  return new NextResponse(file, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

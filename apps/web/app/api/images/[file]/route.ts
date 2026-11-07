import { NextResponse } from "next/server";

import { imageMimeType, readImage } from "../../../../lib/document-images";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }): Promise<NextResponse> {
  const { file } = await context.params;
  const bytes = await readImage(file);
  if (bytes === null) return NextResponse.json({ error: "Picture not found." }, { status: 404 });
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  // The name is the content's hash, so a stored picture never changes.
  return new NextResponse(body, { headers: { "content-type": imageMimeType(file), "cache-control": "private, max-age=31536000, immutable" } });
}

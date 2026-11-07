import { NextResponse } from "next/server";

import { maxImageBytes, storeImage } from "../../../lib/document-images";

export const runtime = "nodejs";

// Stores a picture for the document and answers with the name the document refers to it by.
export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A picture file is required." }, { status: 400 });
  if (file.size > maxImageBytes) return NextResponse.json({ error: "The picture is larger than 20 MB." }, { status: 400 });
  try {
    const stored = await storeImage(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ file: stored.file, width: stored.info.width, height: stored.info.height }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The picture could not be saved." }, { status: 400 });
  }
}

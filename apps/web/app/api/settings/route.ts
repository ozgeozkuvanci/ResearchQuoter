import { NextResponse } from "next/server";

import { getAnthropicApiKey, readAppSettings, writeAppSettings } from "../../../lib/app-settings";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ hasApiKey: (await getAnthropicApiKey()) !== undefined });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => undefined);
  if (typeof payload !== "object" || payload === null || !("apiKey" in payload) || typeof payload.apiKey !== "string") {
    return NextResponse.json({ error: "An API key is required." }, { status: 400 });
  }
  const apiKey = payload.apiKey.trim();
  const settings = await readAppSettings();
  delete settings.anthropicApiKey;
  await writeAppSettings(apiKey.length === 0 ? settings : { ...settings, anthropicApiKey: apiKey });
  return NextResponse.json({ hasApiKey: apiKey.length > 0 });
}

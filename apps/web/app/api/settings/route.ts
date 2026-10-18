import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { type AppSettings, getAnthropicApiKey, readAppSettings, writeAppSettings } from "../../../lib/app-settings";

export const runtime = "nodejs";

async function settingsStatus(settings: AppSettings) {
  return {
    hasApiKey: (await getAnthropicApiKey()) !== undefined,
    hasUpdateToken: settings.githubUpdateToken !== undefined,
    isDesktop: process.env.RESEARCH_DESKTOP === "1",
    updateStatus: await readUpdateStatus()
  };
}

// The desktop shell records the outcome of its latest update check here.
async function readUpdateStatus(): Promise<{ message: string; at: string } | null> {
  const file = process.env.RESEARCH_UPDATE_STATUS_FILE;
  if (file === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && "message" in parsed && "at" in parsed && typeof parsed.message === "string" && typeof parsed.at === "string"
      ? { message: parsed.message, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await settingsStatus(await readAppSettings()));
}

// Each value sent replaces the stored one; an empty string removes it.
export async function PUT(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => undefined);
  const fields = { apiKey: "anthropicApiKey", updateToken: "githubUpdateToken" } as const;
  if (typeof payload !== "object" || payload === null || !Object.keys(fields).some((name) => typeof (payload as Record<string, unknown>)[name] === "string")) {
    return NextResponse.json({ error: "An API key or update token is required." }, { status: 400 });
  }
  const settings = await readAppSettings();
  for (const [name, key] of Object.entries(fields)) {
    const value = (payload as Record<string, unknown>)[name];
    if (typeof value !== "string") continue;
    delete settings[key];
    if (value.trim().length > 0) settings[key] = value.trim();
  }
  await writeAppSettings(settings);
  return NextResponse.json(await settingsStatus(settings));
}

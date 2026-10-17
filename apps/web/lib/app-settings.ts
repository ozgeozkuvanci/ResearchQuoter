import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Local, per-computer settings. The desktop shell points RESEARCH_SETTINGS_FILE into the user's
// application-data folder; development falls back to a git-ignored file next to the local assets.
export interface AppSettings {
  anthropicApiKey?: string;
}

function settingsPath(): string {
  return process.env.RESEARCH_SETTINGS_FILE ?? join(/* turbopackIgnore: true */ process.cwd(), "../../.local-settings.json");
}

export async function readAppSettings(): Promise<AppSettings> {
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsPath(), "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed as AppSettings : {};
  } catch {
    return {};
  }
}

export async function writeAppSettings(settings: AppSettings): Promise<void> {
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function getAnthropicApiKey(): Promise<string | undefined> {
  return (await readAppSettings()).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
}

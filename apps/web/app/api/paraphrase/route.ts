import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { getAnthropicApiKey } from "../../../lib/app-settings";

export const runtime = "nodejs";

const languages: Record<string, string> = {
  tr: "Turkish",
  en: "English",
  source: "the same language as the passage"
};

const alternativesSchema = {
  type: "object",
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          style: { type: "string", description: "Two to four words naming the approach, written in the output language." },
          text: { type: "string" }
        },
        required: ["style", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["alternatives"],
  additionalProperties: false
};

const systemPrompt = [
  "You help an academic researcher restate passages from their sources in their own words.",
  "Write paraphrases that keep the original meaning, claims and hedging exactly, without adding facts, examples or opinions.",
  "Each alternative must differ in approach: for example a close academic restatement, a restructured version that changes sentence order and syntax, a concise summary of the core idea, and a plainer explanatory version.",
  "Do not copy runs of more than four consecutive words from the passage, except technical terms and proper names.",
  "Do not add citations, quotation marks or page numbers; the application adds the reference itself."
].join(" ");

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => undefined);
  if (!isParaphraseRequest(payload)) {
    return NextResponse.json({ error: "A passage of up to 20,000 characters is required." }, { status: 400 });
  }
  const apiKey = await getAnthropicApiKey();
  if (apiKey === undefined) {
    return NextResponse.json({ error: "Öneriler için önce Ayarlar'dan bir Anthropic API anahtarı girin." }, { status: 412 });
  }

  const client = new Anthropic({ apiKey });
  const language = languages[payload.language ?? "source"] ?? languages.source;
  const note = payload.note?.trim() ? `\n\nWhy the researcher is using this passage: ${payload.note.trim()}` : "";
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: alternativesSchema } },
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `Write four alternative paraphrases in ${language} of this passage.${note}\n\n<passage>\n${payload.text}\n</passage>`
      }]
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Bu metin için öneri üretilemedi. Kendi paraphrase'inizi yazabilirsiniz." }, { status: 422 });
    }
    const text = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
    const parsed = JSON.parse(text) as { alternatives: Array<{ style: string; text: string }> };
    return NextResponse.json({ alternatives: parsed.alternatives.filter((item) => item.text.trim().length > 0) });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "API anahtarı geçersiz. Ayarlar'dan kontrol edin." }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Çok fazla istek gönderildi, biraz sonra tekrar deneyin." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return NextResponse.json({ error: "Öneriler için internet bağlantısı gerekiyor." }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Öneri servisi hata verdi (${error.status ?? "?"}).` }, { status: 502 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Öneriler alınamadı." }, { status: 500 });
  }
}

function isParaphraseRequest(value: unknown): value is { text: string; note?: string; language?: string } {
  if (typeof value !== "object" || value === null || !("text" in value) || typeof value.text !== "string") return false;
  const record = value as Record<string, unknown>;
  return value.text.trim().length > 0 && value.text.length <= 20_000
    && (record.note === undefined || typeof record.note === "string")
    && (record.language === undefined || typeof record.language === "string");
}

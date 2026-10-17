# Translation Architecture

## 1. Requirements and constraints

Translation must be optional, editable, provenance-preserving, provider-independent, and local/free by default. Required pairs are Spanish→English/Turkish, English→Turkish, Turkish→English, Latin→English/Turkish/Spanish where technically feasible. Local execution on desktop is the MVP baseline; iPad browser feasibility is a release validation item.

## 2. Provider port

```ts
interface TranslationProvider {
  descriptor(): Promise<{
    providerId: string;
    modelId: string;
    modelVersion: string;
    executionLocation: "browser_local" | "desktop_local" | "self_hosted" | "remote";
    supportedPairs: Array<{ source: string; target: string }>;
  }>;

  translate(input: {
    text: string;
    sourceLanguage: string;
    targetLanguage: string;
    glossary?: Record<string, string>;
  }): Promise<{
    translatedText: string;
    detectedSourceLanguage?: string;
    qualitySignals?: Record<string, number | string>;
  }>;
}
```

Application/domain code uses this port and plain DTOs. Model runtime types remain inside adapters.

## 3. Translation record

Every saved translation revision contains:

- annotation and source PDF/page/anchor relationship;
- immutable original text and hash;
- source and target language;
- raw provider output;
- current user-edited text;
- provider, model, version, execution location;
- generation settings/glossary version where applicable;
- created/modified timestamps and predecessor revision;
- optional quality warnings;
- preferred/non-preferred status.

User edits create a new revision or explicit edited revision state; raw output is never overwritten. Inserting a translation creates a provenance link that still points through the annotation to the original source text.

## 4. Local-first implementation approach

Use a capability-discovery layer rather than hard-coding a model. During implementation:

1. Create a representative evaluation corpus for every required pair, emphasizing academic prose and Latin.
2. Benchmark candidate permissively licensed local models for quality, memory, download size, cold start, and desktop browser/runtime support.
3. Select one desktop-capable adapter only after recording results and license obligations.
4. Cache model packages separately from project data and clearly show their size.
5. Treat iPad local inference as optional until Safari/iPadOS memory and execution tests pass.

No specific model is approved in planning because model availability, licensing, and browser runtime support are time-sensitive and must be validated during implementation. This is an explicit non-guessable decision.

## 5. Cross-device behavior

- Translation records synchronize like other project data after **Sync now**.
- Model binaries do not synchronize through project storage.
- A device without the local model can read/edit existing translations but cannot generate new ones.
- The UI reports `model_not_installed`, `pair_not_supported`, `insufficient_resources`, and `generation_failed` distinctly.
- A future self-hosted or paid remote adapter requires explicit opt-in and disclosure before text leaves the device/server boundary.

## 6. Privacy and security

- Local provider input is not logged.
- Store only privacy-safe diagnostics (length, language pair, duration, model ID, error class).
- Remote adapters are disabled by default and require configuration plus per-provider privacy notice.
- Never send entire PDFs when selected text is sufficient.
- Model artifacts must have pinned checksums and verified licensing/source.

## 7. Quality behavior

- Translation is never presented as authoritative scholarly interpretation.
- Original and translated text are displayed together on demand.
- Latin output carries a quality caveat until corpus evaluation meets the release threshold.
- Citations always cite the original source; translation provider is recorded in provenance but does not replace scholarly attribution.
- User can mark a translation reviewed and add terminology notes/glossary entries.

## 8. Acceptance tests

- Every configured pair either produces a result or a precise unsupported-capability response.
- Original text and provenance survive translation edits and document insertion.
- Provider/model/version metadata is complete.
- No translation content appears in logs.
- Switching adapters does not require data-model migration.
- Existing translations remain readable offline without model binaries.


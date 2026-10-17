import { z } from "zod";

export const schemaVersion = 1;

export const uuidSchema = z.uuid();
export const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 checksum.");
export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(160)
});

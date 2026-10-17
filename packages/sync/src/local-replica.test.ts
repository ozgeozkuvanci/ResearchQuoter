import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { openLocalReplica, readDocumentSnapshot, saveDocumentSnapshot, type LocalReplica } from "./local-replica";

const databaseNames: string[] = [];

async function removeDatabase(databaseName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(removeDatabase));
});

describe("local replica", () => {
  it("keeps a saved document snapshot after reopening IndexedDB", async () => {
    const databaseName = `local-replica-${crypto.randomUUID()}`;
    databaseNames.push(databaseName);
    let replica: LocalReplica = await openLocalReplica(databaseName);

    await saveDocumentSnapshot(replica, {
      documentId: "document-1",
      content: '{"type":"doc","content":[]}',
      savedAt: "2026-07-10T00:00:00.000Z"
    });
    replica.close();

    replica = await openLocalReplica(databaseName);

    await expect(readDocumentSnapshot(replica, "document-1")).resolves.toEqual({
      documentId: "document-1",
      content: '{"type":"doc","content":[]}',
      savedAt: "2026-07-10T00:00:00.000Z"
    });
    replica.close();
  });
});

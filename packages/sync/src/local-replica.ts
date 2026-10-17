import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface LocalReplicaSchema extends DBSchema {
  documentSnapshots: {
    key: string;
    value: {
      documentId: string;
      content: string;
      savedAt: string;
    };
  };
}

export type LocalReplica = IDBPDatabase<LocalReplicaSchema>;

export async function openLocalReplica(databaseName: string): Promise<LocalReplica> {
  return openDB<LocalReplicaSchema>(databaseName, 1, {
    upgrade(database) {
      database.createObjectStore("documentSnapshots", { keyPath: "documentId" });
    }
  });
}

export async function saveDocumentSnapshot(
  replica: LocalReplica,
  snapshot: LocalReplicaSchema["documentSnapshots"]["value"]
): Promise<void> {
  await replica.put("documentSnapshots", snapshot);
}

export async function readDocumentSnapshot(
  replica: LocalReplica,
  documentId: string
): Promise<LocalReplicaSchema["documentSnapshots"]["value"] | undefined> {
  return replica.get("documentSnapshots", documentId);
}

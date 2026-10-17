import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "./generated/client";

export interface DatabaseClient {
  prisma: PrismaClient;
  close(): Promise<void>;
}

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return {
    prisma,
    async close(): Promise<void> {
      await prisma.$disconnect();
    }
  };
}

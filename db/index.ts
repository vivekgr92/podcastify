import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure the connection with specific SSL settings for security
const client = postgres(process.env.DATABASE_URL, {
  ssl: {
    rejectUnauthorized: false
  },
  max: 1
});

export const db = drizzle(client, { schema });

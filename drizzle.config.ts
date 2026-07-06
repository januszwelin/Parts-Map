import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit is a standalone CLI — unlike `next dev`/`build`, it doesn't
// auto-load .env.local, so DATABASE_URL is empty unless we load it here.
config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

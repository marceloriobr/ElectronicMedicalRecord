import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, DATABASE_FILE } from "../src/db";

migrate(db, { migrationsFolder: "drizzle" });
console.log(`Migrações aplicadas em ${DATABASE_FILE}.`);

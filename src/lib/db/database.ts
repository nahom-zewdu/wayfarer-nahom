import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { schema } from "./schema";

export type SqliteDatabase = InstanceType<typeof Database>;

const busyTimeoutMilliseconds = 5_000;
const defaultDatabasePath = resolve(process.cwd(), "data", "wayfarer.sqlite");

export function initializeDatabase(db: SqliteDatabase): void {
  db.pragma("foreign_keys = ON");
  db.pragma(`busy_timeout = ${busyTimeoutMilliseconds}`);
  db.exec(schema);
}

export function openDatabase(
  filename = process.env.DATABASE_PATH ?? defaultDatabasePath,
): SqliteDatabase {
  if (filename !== ":memory:") {
    const directory = dirname(filename);
    if (directory !== ".") {
      mkdirSync(directory, { recursive: true });
    }
  }

  const db = new Database(filename, {
    timeout: busyTimeoutMilliseconds,
  });

  try {
    initializeDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

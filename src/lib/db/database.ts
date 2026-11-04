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
  const initialize = db.transaction(() => {
    db.exec(schema);
    const bookingColumns = new Set(
      db
        .prepare("PRAGMA table_info(bookings)")
        .all()
        .map((column) => (column as { name: string }).name),
    );

    if (!bookingColumns.has("cancelled_at")) {
      db.exec(
        `ALTER TABLE bookings ADD COLUMN cancelled_at TEXT
         CHECK (cancelled_at IS NULL OR
           (length(cancelled_at) = 24 AND cancelled_at GLOB '????-??-??T??:??:??.???Z'))`,
      );
    }
    if (!bookingColumns.has("idempotency_key")) {
      db.exec(
        `ALTER TABLE bookings ADD COLUMN idempotency_key TEXT
         CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128)`,
      );
    }
    if (!bookingColumns.has("remaining_seats")) {
      db.exec(
        `ALTER TABLE bookings ADD COLUMN remaining_seats INTEGER
         CHECK (remaining_seats IS NULL OR
           (typeof(remaining_seats) = 'integer' AND remaining_seats >= 0))`,
      );
    }

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_user_idempotency_key
       ON bookings (user_id, idempotency_key)
       WHERE idempotency_key IS NOT NULL`,
    );
  });
  initialize.immediate();
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

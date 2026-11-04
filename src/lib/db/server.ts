import { openDatabase, type SqliteDatabase } from "./database";

declare global {
  var wayfarerServerDatabase: SqliteDatabase | undefined;
}

export function resetServerDatabase(): void {
  globalThis.wayfarerServerDatabase?.close();
  globalThis.wayfarerServerDatabase = undefined;
}

export function getServerDatabase(): SqliteDatabase {
  if (!globalThis.wayfarerServerDatabase) {
    globalThis.wayfarerServerDatabase = openDatabase();
  }

  return globalThis.wayfarerServerDatabase;
}

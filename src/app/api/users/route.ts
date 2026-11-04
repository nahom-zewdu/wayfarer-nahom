import { connection } from "next/server";
import { unexpectedApiError } from "../../../lib/api/http";
import { getServerDatabase } from "../../../lib/db/server";

interface UserRow {
  id: string;
  name: string;
}

export async function GET(): Promise<Response> {
  await connection();

  try {
    const users = getServerDatabase()
      .prepare("SELECT id, name FROM users ORDER BY name ASC, id ASC")
      .all() as UserRow[];

    return Response.json({ users });
  } catch (error) {
    return unexpectedApiError(error);
  }
}

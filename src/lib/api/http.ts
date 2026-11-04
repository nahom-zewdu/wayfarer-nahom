export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function invalidId(id: string): boolean {
  return id.trim() === "" || id !== id.trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

export async function readJsonObject(
  request: Request,
): Promise<JsonObjectResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return {
      ok: false,
      response: jsonError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json.",
      ),
    };
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError(400, "MALFORMED_JSON", "Request body must be valid JSON."),
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      response: jsonError(400, "INVALID_INPUT", "Request body must be a JSON object."),
    };
  }

  return { ok: true, value };
}

export function getActingUserId(request: Request): string | Response {
  const userId = request.headers.get("x-user-id");
  if (userId === null || invalidId(userId)) {
    return jsonError(
      400,
      "INVALID_INPUT",
      "A valid X-User-Id header is required.",
    );
  }

  return userId;
}

export function unexpectedApiError(error: unknown): Response {
  console.error("Unexpected API error:", error);
  return jsonError(
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected server error occurred.",
  );
}

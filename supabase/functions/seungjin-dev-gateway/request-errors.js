// Only explicitly classified validation errors are safe to return to the client.
export class ValidationError extends Error {}

export async function readRequestBody(request) {
  let body;
  try { body = await request.json(); } catch (_error) {
    throw new ValidationError("요청 형식이 올바르지 않습니다. 화면을 새로고침해주세요.");
  }
  if (!body || Array.isArray(body) || typeof body !== "object"
    || typeof body.action !== "string" || !body.action.trim()
    || (body.payload !== undefined && (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)))) {
    throw new ValidationError("요청 항목을 확인해주세요.");
  }
  return { action: body.action.trim(), payload: body.payload || {} };
}

export function publicError(error, conflictMessages, ConflictClass) {
  const message = error instanceof Error ? error.message : String(error);
  const conflict = error instanceof ConflictClass ? message : conflictMessages.get(message);
  if (conflict) return { status: 409, message: conflict };
  if (error instanceof ValidationError) return { status: 400, message };
  return { status: 500, message: "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 확인해주세요." };
}

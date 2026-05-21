type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false };

export async function readJsonBody(req: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

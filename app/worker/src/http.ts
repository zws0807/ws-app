import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "./env";
import type { User } from "../../shared/contracts";
export type App = {
  Bindings: Env;
  Variables: { user: User; sessionHash: string; csrf: string };
};
export class ApiFailure extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(
  status: ApiFailure["status"],
  code: string,
  message: string,
): never {
  throw new ApiFailure(status, code, message);
}
export async function body<T>(
  c: Context<App>,
  schema: z.ZodType<T>,
): Promise<T> {
  let b;
  try {
    b = await c.req.json();
  } catch {
    fail(400, "invalid_json", "请求内容不是有效JSON");
  }
  const r = schema.safeParse(b);
  if (r.success) return r.data;
  return fail(
    400,
    "invalid_input",
    r.error.issues[0]?.message || "输入格式无效",
  );
}
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

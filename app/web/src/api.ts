export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(data instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { "x-csrf-token": csrf }),
      ...extra,
    },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
  });
  let b: any;
  try {
    b = await r.json();
  } catch {
    throw new ApiError(
      r.status,
      "invalid_response",
      "服务响应异常，请保留输入后重试",
    );
  }
  if (!r.ok)
    throw new ApiError(r.status, b.code, b.message || "操作失败，请重试");
  return b;
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请稍后重试";

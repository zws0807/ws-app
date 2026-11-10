import { SELF } from "cloudflare:test";
export const origin = "https://app.test";
export const password = "private-password-2026";
export class Client {
  cookie = "";
  csrf = "";
  async call(
    path: string,
    method = "GET",
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const r = await SELF.fetch(origin + path, {
      method,
      headers: {
        origin,
        cookie: this.cookie,
        "x-csrf-token": this.csrf,
        ...(data instanceof FormData
          ? {}
          : { "content-type": "application/json" }),
        ...headers,
      },
      body:
        data === undefined
          ? undefined
          : data instanceof FormData
            ? data
            : JSON.stringify(data),
    });
    const cookie = r.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return r;
  }
  async register(
    username = "u" + crypto.randomUUID().replaceAll("-", "").slice(0, 15),
    pwd = password,
  ) {
    const r = await this.call("/api/auth/register", "POST", {
      username,
      password: pwd,
      turnstileToken: "test-token",
    });
    const b: any = await r.json();
    if (r.status !== 201)
      throw new Error("register failed " + r.status + " " + JSON.stringify(b));
    this.csrf = b.csrfToken;
    return b;
  }
  async login(username: string, pwd = password) {
    const r = await this.call("/api/auth/login", "POST", {
      username,
      password: pwd,
      turnstileToken: "test-token",
    });
    const b: any = await r.json();
    if (r.ok) this.csrf = b.csrfToken;
    return { r, b };
  }
}

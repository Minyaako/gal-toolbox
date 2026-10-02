import { afterEach, expect, it, vi } from "vitest";
import { rankingApi } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("keeps account conflicts distinct from stale board errors and includes Retry-After", async () => {
  for (const [code, message, expected] of [["ACCOUNT_EXISTS", "此邮箱已注册", "此邮箱已注册"], ["VERSION_CONFLICT", "conflict", "输入已保留"], ["RATE_LIMITED", "稍后重试", "60 秒"]]) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message } }), { status: code === "RATE_LIMITED" ? 429 : 409, headers: { "Retry-After": "60" } })));
    await expect(rankingApi("/auth/register", "POST", {})).rejects.toThrow(expected);
  }
});

import { useState } from "react";
import { rankingApi, type RankingUser } from "./api";

export function Account({ user, onChange }: { user: RankingUser | null; onChange: (user: RankingUser | null) => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="ranking-account" aria-label="榜单账号">
    {user ? <div className="ranking-actions"><span>已登录：{user.displayName} · 邮箱未验证</span><button disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await rankingApi("/auth/logout", "POST", {}); onChange(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>退出登录</button></div> : <details><summary>登录 / 注册以创建榜单和贡献评分</summary>
      <p>首版不验证邮箱，也不支持邮件找回密码。请妥善保存密码；评价会公开显示昵称。</p>
      <form className="ranking-form" onSubmit={async (event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
        try { const result = await rankingApi<{ user: RankingUser }>(`/auth/${register ? "register" : "login"}`, "POST", Object.fromEntries(data)); onChange(result.user); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        <label>邮箱<input name="email" type="email" autoComplete="username" maxLength={254} required /></label>
        <label>密码<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={10} maxLength={128} required /></label>
        {register && <label>公开昵称<input name="displayName" autoComplete="nickname" maxLength={40} required /></label>}
        <button disabled={busy}>{busy ? "请稍候…" : register ? "创建账号" : "登录"}</button>
        <button type="button" disabled={busy} onClick={() => setRegister(!register)}>{register ? "已有账号，去登录" : "没有账号，去注册"}</button>
      </form>
    </details>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

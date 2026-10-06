"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const next = useSearchParams().get("next") ?? "/play";
  const [form, setForm] = useState({ username: "", email: "", password: "", login: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const payload =
      mode === "login"
        ? { login: form.login, password: form.password }
        : { username: form.username, email: form.email, password: form.password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? "Something went wrong");
      setBusy(false);
      return;
    }
    window.location.href = next.startsWith("/") ? next : "/play";
  };

  return (
    <form className="auth" onSubmit={submit}>
      <h1 style={{ fontSize: 28 }}>{mode === "login" ? "Welcome back" : "Create your player"}</h1>
      <p className="muted small">{mode === "login" ? "The streets missed you." : "Free forever. Takes 20 seconds."}</p>
      {mode === "signup" ? (
        <>
          <label>Player name</label>
          <input value={form.username} onChange={set("username")} autoComplete="username" required minLength={3} maxLength={20} placeholder="NightRunner" />
          <label>Email</label>
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </>
      ) : (
        <>
          <label>Player name or email</label>
          <input value={form.login} onChange={set("login")} autoComplete="username" required />
        </>
      )}
      <label>Password</label>
      <input type="password" value={form.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : 1} />
      {err && <div className="err">{err}</div>}
      <button className="btn block" style={{ marginTop: 18 }} disabled={busy}>
        {busy ? "..." : mode === "login" ? "Log in" : "Start playing"}
      </button>
      <p className="small muted center" style={{ marginTop: 14 }}>
        {mode === "login" ? (
          <>New here? <Link href="/signup">Create an account</Link></>
        ) : (
          <>Already playing? <Link href="/login">Log in</Link></>
        )}
      </p>
    </form>
  );
}

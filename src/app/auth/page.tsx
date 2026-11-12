"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
export default function AuthPage() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=/chat/new` } });
    setBusy(false); if (error) setError(error.message); else setSent(true);
  }
  return <main className="auth-wrap"><section className="auth-card"><Link className="brand" href="/">Voice</Link><p className="eyebrow">A quieter way to get things done</p><h1>{sent ? "Check your inbox" : "Come on in."}</h1><p>{sent ? `We sent a sign-in link to ${email}.` : "Enter your email and we'll send you a secure sign-in link."}</p>{!sent && <form onSubmit={submit}><label className="field"><span>Email address</span><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>{error && <p className="error" role="alert">{error}</p>}<button className="pill" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button></form>}</section></main>;
}

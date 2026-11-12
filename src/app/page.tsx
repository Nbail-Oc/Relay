import Link from "next/link";
export default function Home() {
  return <main className="landing"><section className="hero"><span className="eyebrow">PayPal Copilot · voice first</span><h1>Talk through<br/>your next move.</h1><p>A thoughtful voice assistant for the work around your PayPal account. Start with a conversation, and take it one step at a time.</p><Link className="pill" href="/auth">Start a conversation <span aria-hidden="true">↗</span></Link></section></main>;
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Voice — PayPal Copilot", description: "A voice-first assistant for your PayPal workflows." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

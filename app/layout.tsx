import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Complaint Concierge — AFCA complaint demo",
  description: "A chat that fills in an AFCA complaint form. Demo only; not affiliated with AFCA.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={nunito.className}>
      <body className="bg-afca-mist text-afca-navy antialiased">{children}</body>
    </html>
  );
}

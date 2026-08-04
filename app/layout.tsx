import type { Metadata } from "next";
import "./globals.css";
import { getCurrentProfile } from "@/lib/auth";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Prediction Market DAO",
  description: "労働(広告視聴・アンケート)で貯まる金庫を原資にした分散型予測市場MVP",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <Header profile={profile} />
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 pb-24 pt-6">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}

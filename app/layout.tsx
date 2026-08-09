import type { Metadata } from "next";
import "./globals.css";
import { getCurrentProfile } from "@/lib/auth";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import SchemaWarning from "@/components/SchemaWarning";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Prediction Market DAO",
  description: "労働(広告視聴・アンケート)で貯まる金庫を原資にした分散型予測市場MVP",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <SchemaWarning />
        <Header profile={profile} />
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-6">
          {children}
        </main>
        {/* BottomNav が固定表示で下端を覆うので、その分だけ余白を足す。
            ここを詰めるとフッターのリンクがナビの裏に隠れて押せない。 */}
        <div className="pb-24">
          <SiteFooter />
        </div>
        <BottomNav />
      </body>
    </html>
  );
}

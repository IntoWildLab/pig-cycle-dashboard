import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猪周期观察",
  description: "生猪价格、成本与核心养殖标的趋势仪表盘",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

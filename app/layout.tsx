import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PsyContent — Контент для психологов",
  description: "AI-платформа для создания контента. Посты, рилс, стратегия — без плясок.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Файлы, которые серверный код читает с диска через fs (process.cwd()). На Vercel папка public в функции
  // не попадает сама, без этого рендер каруселей падает без шрифтов и человечков, а генерация идет без живых примеров
  outputFileTracingIncludes: {
    '/api/carousel/**': ['./public/carousel/**/*'],
    '/api/**': ['./lib/generation/*.json'],
  },
  images: {
    // Наши собственные SVG-логотипы из /public. Без этого next/image блокирует SVG
    // и вместо лого показывается alt-текст.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;

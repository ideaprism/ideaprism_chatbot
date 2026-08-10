import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 페르소나 대본(personas/*.txt)과 흐름 지침(flow/*.md)은 서버가 런타임에 읽는다.
  // Vercel 배포 시 번들에 함께 포함되도록 명시적으로 추적한다.
  outputFileTracingIncludes: {
    "/api/chat": ["./personas/**", "./flow/**"],
    "/api/health": ["./personas/**", "./flow/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/ideaprism/**",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 페르소나 대본(personas/*.txt)과 흐름 지침(flow/*.md)은 서버가 런타임에 읽는다.
  // 경로를 코드에서 조립하므로 Next가 자동으로 못 찾는다 — 명시적으로 추적한다.
  // 안 하면 배포한 서버에서 대본을 못 읽어 채팅이 죽는다.
  //
  // 라우트를 하나씩 적지 않고 전체(`/**`)로 잡은 이유: 지금은 /api/chat,
  // /api/health, /api/admin/prompts/[kind]/[name] 이 읽지만, 앞으로 파일을 읽는
  // 라우트가 늘 때마다 여기 추가하는 걸 잊기 쉽다. 12개 텍스트 파일이라 전부
  // 넣어도 부담이 없다.
  outputFileTracingIncludes: {
    "/**": ["./personas/**", "./flow/**"],
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

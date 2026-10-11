import type { NextConfig } from 'next'

// ★scaffold 기본값에서 `cacheComponents`·`partialPrefetching` 을 걷어냈다.
//   create-next-app 이 받아 온 Next 16.4 전용 옵션인데 우리는 사업 본체와 같은 16.2.9 라
//   타입 검사에서 깨진다[빌드 실측 2026-10-11]. 버전을 올리지 않고 옵션을 맞춘다 —
//   미러가 본체보다 앞서면 이식할 때 런타임 차이가 그 자리에서 터진다.
const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig

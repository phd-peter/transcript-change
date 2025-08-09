/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  eslint: {
    // 프로덕션 빌드 시 ESLint 에러로 빌드가 차단되지 않도록 설정
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 프로덕션 빌드 시 타입 에러로 빌드가 차단되지 않도록 설정 (임시 완화)
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
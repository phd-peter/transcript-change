import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Transcript Change',
  description: '이미지 마스킹 및 데이터 추출 도구',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
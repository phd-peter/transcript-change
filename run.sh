#!/bin/bash

echo "🚀 Transcript Change 시작"

# 백엔드 실행
echo "📡 백엔드 서버 시작 중..."
cd backend
python main.py &
BACKEND_PID=$!
cd ..

# 잠시 대기 (백엔드 서버가 시작될 시간)
sleep 3

# 프론트엔드 실행
echo "🎨 프론트엔드 서버 시작 중..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ 서버 시작 완료!"
echo "📍 프론트엔드: http://localhost:3000"
echo "📍 백엔드: http://localhost:8000"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"

# Ctrl+C 처리
trap 'echo "🛑 서버 종료 중..."; kill $BACKEND_PID $FRONTEND_PID; exit' INT

# 대기
wait
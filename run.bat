@echo off
echo 🚀 Transcript Change 시작

echo 📡 백엔드 서버 시작 중...
cd backend
start /B python main.py
cd ..

timeout /t 3 /nobreak >nul

echo 🎨 프론트엔드 서버 시작 중...
cd frontend
start /B npm run dev
cd ..

echo ✅ 서버 시작 완료!
echo 📍 프론트엔드: http://localhost:3000
echo 📍 백엔드: http://localhost:8000
echo.
echo 종료하려면 아무 키나 누르세요
pause >nul

echo 🛑 서버 종료 중...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
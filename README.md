# Transcript Change

이미지에서 표 데이터를 추출하는 웹 애플리케이션입니다. 사용자가 이미지를 업로드하고 웹에서 마스킹 영역을 선택하면, Gemini AI가 표 형식 데이터를 자동으로 추출합니다.

## 기능

- 📁 **이미지 업로드**: 드래그 앤 드롭 또는 파일 선택으로 이미지 업로드
- 🎯 **인터랙티브 마스킹**: 웹에서 클릭으로 마스킹 영역 선택
- 🤖 **AI 데이터 추출**: Google Gemini API로 표 데이터 자동 추출
- 📊 **결과 표시**: 추출된 데이터를 테이블로 표시 및 CSV 다운로드

## 시스템 요구사항

- Python 3.8+
- Node.js 18+
- Google Gemini API 키

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone <repository-url>
cd transcript-change
```

### 2. 환경 설정

```bash
# .env 파일 생성
cp .env.example .env

# .env 파일을 열어 Gemini API 키 설정
# GEMINI_API_KEY=your_actual_api_key_here
```

### 3. 백엔드 설정 및 실행

```bash
# 백엔드 디렉토리로 이동
cd backend

# 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
python main.py
```

백엔드 서버가 http://localhost:8000 에서 실행됩니다.

### 4. 프론트엔드 설정 및 실행

```bash
# 새 터미널에서 프론트엔드 디렉토리로 이동
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

프론트엔드 앱이 http://localhost:3000 에서 실행됩니다.

## 사용 방법

1. **웹 브라우저에서 http://localhost:3000 접속**

2. **이미지 업로드**
   - 표 형식 데이터가 포함된 이미지를 업로드합니다
   - 지원 형식: PNG, JPG, JPEG, GIF, BMP, WebP

3. **마스킹 영역 선택**
   - 업로드된 이미지에서 제거하고 싶은 부분을 클릭하여 선택
   - 좌상단 → 우하단 순서로 두 점을 클릭하여 사각형 영역 생성
   - 여러 영역 선택 가능

4. **데이터 추출**
   - "데이터 추출 시작" 버튼 클릭
   - AI가 마스킹 처리된 이미지에서 표 데이터를 추출

5. **결과 확인**
   - 추출된 데이터를 테이블로 확인
   - CSV 파일로 다운로드 또는 클립보드 복사

## API 엔드포인트

### 백엔드 API (http://localhost:8000)

- `POST /upload` - 이미지 파일 업로드
- `POST /process` - 마스킹 및 데이터 추출
- `GET /files/{filename}` - 파일 정보 조회
- `GET /uploads/{filename}` - 업로드된 파일 조회
- `GET /processed/{filename}` - 처리된 파일 조회

## 프로젝트 구조

```
transcript-change/
├── backend/                 # FastAPI 백엔드
│   ├── main.py             # 메인 서버 파일
│   ├── requirements.txt    # Python 의존성
│   ├── uploads/            # 업로드된 파일 저장
│   └── processed/          # 처리된 파일 저장
├── frontend/               # Next.js 프론트엔드
│   ├── app/
│   │   ├── components/     # React 컴포넌트
│   │   ├── globals.css     # 전역 스타일
│   │   ├── layout.tsx      # 레이아웃
│   │   └── page.tsx        # 메인 페이지
│   ├── package.json        # Node.js 의존성
│   └── tailwind.config.js  # Tailwind CSS 설정
├── .env.example            # 환경변수 예시
└── README.md              # 이 파일
```

## 기존 Python 스크립트

프로젝트에는 기존에 개발된 Python 스크립트들도 포함되어 있습니다:

- `gemini_funtion.py` - 폴더 내 여러 이미지 배치 처리
- `gemini_funtion_light.py` - 단일 이미지 처리
- `masking.py` - 고정 좌표 마스킹
- `masking-mouse.py` - 마우스 클릭 좌표 확인

## 문제 해결

### 일반적인 문제

1. **Gemini API 키 오류**
   - `.env` 파일에 올바른 API 키가 설정되어 있는지 확인
   - API 키에 특수문자가 포함된 경우 따옴표로 감싸기

2. **CORS 오류**
   - 백엔드가 8000 포트에서 실행되고 있는지 확인
   - 프론트엔드가 3000 포트에서 실행되고 있는지 확인

3. **파일 업로드 실패**
   - `backend/uploads` 디렉토리 권한 확인
   - 파일 크기 제한 확인 (기본 10MB)

4. **이미지 표시 안됨**
   - 백엔드 정적 파일 서빙이 정상 작동하는지 확인
   - 브라우저 개발자 도구에서 네트워크 오류 확인

### 포트 변경

기본 포트를 변경하려면:

**백엔드 포트 변경 (main.py 맨 아래)**
```python
uvicorn.run(app, host="0.0.0.0", port=8001)  # 8000 → 8001
```

**프론트엔드에서 백엔드 URL 변경**
모든 컴포넌트에서 `http://localhost:8000`을 새 포트로 변경

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 기여

버그 리포트, 기능 요청, 풀 리퀘스트를 환영합니다!
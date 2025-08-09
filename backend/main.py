from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import List, Tuple, Dict, Any, Optional
import cv2
import numpy as np
import os
import tempfile
import json
import re
from datetime import datetime, timedelta
import shutil
from dotenv import load_dotenv
import asyncio
from concurrent.futures import ThreadPoolExecutor
from supabase import create_client, Client
from jose import JWTError, jwt
from passlib.context import CryptContext
import uuid

# .env 파일 로드
load_dotenv()

app = FastAPI(title="Transcript Change API", version="2.0.0")

# CORS 설정
# FRONTEND_ORIGINS 환경변수로 허용 오리진을 제어합니다 (콤마로 구분)
# 기본값에는 localhost/127.0.0.1의 3000, 3001 포트를 포함합니다
frontend_origins_env = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001",
)
ALLOWED_ORIGINS = [o.strip() for o in frontend_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase 설정
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL and KEY must be set in environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Service Role 클라이언트 (관리자 권한)
if SUPABASE_SERVICE_KEY:
    admin_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    admin_supabase = supabase  # fallback

# 업로드된 파일 저장 디렉토리 (환경변수로 경로 오버라이드 가능)
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
PROCESSED_DIR = os.getenv("PROCESSED_DIR", "processed")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# 정적 파일 서빙 설정
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")

# 패스워드 해싱 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

# Pydantic 모델
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    created_at: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class MaskRegion(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class ProcessImageRequest(BaseModel):
    filename: str
    mask_regions: List[MaskRegion]
    session_name: Optional[str] = None

class ImageMaskData(BaseModel):
    filename: str
    mask_regions: List[MaskRegion]

class ProcessMultipleImagesRequest(BaseModel):
    images: List[ImageMaskData]
    session_name: Optional[str] = None

class UserDataResponse(BaseModel):
    data: List[Dict[str, Any]]
    total_count: int
    sessions: List[Dict[str, Any]]

# 유틸리티 함수
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Supabase에서 사용자 정보 조회
    try:
        response = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
        if not response.data:
            raise credentials_exception
        user = response.data[0]
        return user
    except Exception:
        raise credentials_exception

async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)):
    """선택적 인증: 토큰이 있으면 사용자 정보 반환, 없으면 None 반환"""
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    
    # Supabase에서 사용자 정보 조회
    try:
        response = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
        if not response.data:
            return None
        user = response.data[0]
        return user
    except Exception:
        return None

def extract_table_data_gemini(api_key: str, image_path: str):
    """표 형식 이미지에서 데이터를 추출하는 함수"""
    from google import genai
    from google.genai import types
    
    client = genai.Client(api_key=api_key)
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            (
                """
                이 이미지에는 표 형식의 데이터가 포함되어 있습니다. 당신의 임무는 이 표의 내용을 이해하고 인식하여 구조화된 데이터로 변환하는 것입니다.

                ## 분석 지침:
                1. 반출 내용을 확인하세요 1)입고 2) 출고
                2. 구매방법을 확인하세요 1)매매 2)임대
                3. 구매 품명(규격)을 확인하세요 
                ex) 298x201, 150x150, 200x100, 200x200, 250x175, 250x250, 298x149, 300x150, 294x200, 298x201, 300x300, 350x175, 340x250, 350x350, 400x200, 390x300, 400x400
                4. 길이와 갯수를 파악하세요. 조금 이상한 글자가 써있으면 그거입니다. 
                ex) 12x34 -> 12m, 34개
                ex2) 10x12 -> 10m, 12개
                ex3) 12.1 -> 12.1m, 1개
                ex4) 11.8 -> 11.8m, 1개
                길이는 m를 제외하고 float형식으로 출력하세요
                개수는 int형식으로 출력하세요                
                
                이미지 1개당 1개의 행렬로 출력하면 됩니다. 행렬은 반출내용, 구매방법, 구매 품명(규격), 길이1, 갯수1, 길이2, 갯수2, ... 순으로 출력하세요.

                ## 출력 형식:
                다음 JSON 형식으로 정확히 반환해주세요:
                {
                    "headers": ["반출내용", "구매방법", "구매 품명(규격)", "길이1", "갯수1", "길이2", "갯수2", ...],
                    "rows": [
                        ["행1열1값", "행1열2값", "행1열3값", ...],
                        ["행2열1값", "행2열2값", "행2열3값", ...],
                        ...
                    ]
                }
                """
            ),
        ],
    )
    
    raw = response.text.strip()
    # 코드블록 백틱이 있을 경우 제거
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.DOTALL).strip()
    
    return json.loads(raw)

def apply_masking(image_path: str, mask_regions: List[MaskRegion], output_path: str):
    """이미지에 마스킹을 적용하는 함수"""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"이미지를 불러올 수 없습니다: {image_path}")
    
    # 마스킹 실행
    for region in mask_regions:
        x1, y1 = min(region.x1, region.x2), min(region.y1, region.y2)
        x2, y2 = max(region.x1, region.x2), max(region.y1, region.y2)
        
        # 흰색으로 마스킹
        cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), -1)
    
    # 결과 저장
    cv2.imwrite(output_path, img)
    return output_path

# API 라우트
@app.get("/")
async def root():
    return {"message": "Transcript Change API v2.0", "features": ["authentication", "supabase_storage"]}

@app.post("/auth/register", response_model=Token)
async def register(user: UserRegister):
    """사용자 회원가입"""
    try:
        # Supabase Auth로 사용자 생성
        auth_response = supabase.auth.sign_up({
            "email": user.email,
            "password": user.password,
            "options": {
                "data": {
                    "display_name": user.display_name or user.email.split("@")[0]
                }
            }
        })
        
        if auth_response.user is None:
            raise HTTPException(status_code=400, detail="회원가입에 실패했습니다.")
        
        user_id = auth_response.user.id
        display_name = user.display_name or user.email.split("@")[0]

        # 이메일 즉시 확인 처리 (개발/내부용): 서비스 롤 키가 있으면 바로 confirm
        try:
            if SUPABASE_SERVICE_KEY:
                # 일부 버전에서는 attributes 키 없이도 동작하지만, 호환성을 위해 딕셔너리만 전달
                admin_supabase.auth.admin.update_user_by_id(user_id, {"email_confirm": True})
        except Exception as confirm_error:
            # 확인 실패하더라도 회원가입은 계속 진행
            print(f"Email confirm step failed: {confirm_error}")
        
        # user_profiles에 프로필 정보 삽입 (Service Role 사용)
        try:
            profile_data = {
                "id": user_id,
                "email": user.email,
                "display_name": display_name
            }
            
            # Service Role로 관리자 권한으로 삽입
            profile_response = admin_supabase.table("user_profiles").insert(profile_data).execute()
            print(f"Profile created successfully: {profile_response.data}")
            
            # 삽입된 프로필 데이터 사용 (created_at 포함)
            if profile_response.data:
                created_profile = profile_response.data[0]
                created_at_str = created_profile.get("created_at", "")
            else:
                # fallback: auth response의 created_at을 문자열로 변환
                created_at_str = auth_response.user.created_at.isoformat() if hasattr(auth_response.user.created_at, 'isoformat') else str(auth_response.user.created_at)
            
        except Exception as profile_error:
            print(f"Profile creation error: {profile_error}")
            # 프로필 생성에 실패해도 회원가입은 완료되었으므로 계속 진행
            # auth response의 created_at을 문자열로 변환해서 사용
            created_at_str = auth_response.user.created_at.isoformat() if hasattr(auth_response.user.created_at, 'isoformat') else str(auth_response.user.created_at)
        
        # JWT 토큰 생성
        access_token = create_access_token(data={"sub": user_id})
        
        user_response = UserResponse(
            id=user_id,
            email=user.email,
            display_name=display_name,
            created_at=created_at_str  # 문자열로 변환된 created_at 사용
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=400, detail=f"회원가입 중 오류가 발생했습니다: {str(e)}")

@app.post("/auth/login", response_model=Token)
async def login(user: UserLogin):
    """사용자 로그인"""
    try:
        # Supabase Auth로 로그인
        auth_response = supabase.auth.sign_in_with_password({
            "email": user.email,
            "password": user.password
        })
        
        if auth_response.user is None:
            raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
        
        user_id = auth_response.user.id
        
        # user_profiles에서 사용자 정보 조회 (없으면 자동 생성 시도)
        profile_response = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
        if not profile_response.data:
            try:
                fallback_profile = {
                    "id": user_id,
                    "email": user.email,
                    "display_name": user.email.split("@")[0],
                }
                admin_supabase.table("user_profiles").insert(fallback_profile).execute()
                profile_response = supabase.table("user_profiles").select("*").eq("id", user_id).execute()
            except Exception as create_profile_err:
                raise HTTPException(status_code=404, detail=f"사용자 프로필을 찾을 수 없습니다: {create_profile_err}")
        profile = profile_response.data[0]
        
        # JWT 토큰 생성
        access_token = create_access_token(data={"sub": user_id})
        
        # created_at을 문자열로 변환
        created_at_str = profile["created_at"]
        if hasattr(created_at_str, 'isoformat'):
            created_at_str = created_at_str.isoformat()
        elif not isinstance(created_at_str, str):
            created_at_str = str(created_at_str)
        
        user_response = UserResponse(
            id=user_id,
            email=profile["email"],
            display_name=profile["display_name"],
            created_at=created_at_str
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_response
        )
        
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"로그인 중 오류가 발생했습니다: {str(e)}")

@app.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """현재 사용자 정보 조회"""
    # created_at을 문자열로 변환
    created_at_str = current_user["created_at"]
    if hasattr(created_at_str, 'isoformat'):
        created_at_str = created_at_str.isoformat()
    elif not isinstance(created_at_str, str):
        created_at_str = str(created_at_str)
    
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        display_name=current_user["display_name"],
        created_at=created_at_str
    )

@app.get("/user/data", response_model=UserDataResponse)
async def get_user_data(current_user: dict = Depends(get_current_user)):
    """사용자의 모든 추출 데이터 조회"""
    try:
        # 사용자의 추출 데이터 조회
        data_response = supabase.table("extracted_data").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
        
        # 사용자의 세션 정보 조회
        sessions_response = supabase.table("user_sessions").select("*").eq("user_id", current_user["id"]).order("created_at", desc=True).execute()
        
        return UserDataResponse(
            data=data_response.data,
            total_count=len(data_response.data),
            sessions=sessions_response.data
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 조회 중 오류가 발생했습니다: {str(e)}")

@app.post("/upload")
async def upload_image(file: UploadFile = File(...), current_user: Optional[dict] = Depends(get_current_user_optional)):
    """이미지 파일 업로드 (인증 필요)"""
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다.")
    
    # 고유 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # 파일 저장
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {
        "filename": filename,
        "message": "파일 업로드 완료",
        "file_path": file_path,
        "user_id": current_user["id"] if current_user else None
    }

@app.post("/upload-multiple")
async def upload_multiple_images(files: List[UploadFile] = File(...), current_user: Optional[dict] = Depends(get_current_user_optional)):
    """다중 이미지 파일 업로드 (인증 선택사항)"""
    uploaded_files = []
    
    for file in files:
        if not file.content_type.startswith('image/'):
            continue  # 이미지가 아닌 파일은 건너뛰기
        
        # 고유 파일명 생성
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # 마이크로초까지 포함
        filename = f"{timestamp}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        # 파일 저장
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 이미지 크기 정보 가져오기
        img = cv2.imread(file_path)
        height, width = img.shape[:2]
        
        uploaded_files.append({
            "filename": filename,
            "original_name": file.filename,
            "width": width,
            "height": height,
            "file_path": file_path
        })
    
    return {
        "uploaded_files": uploaded_files,
        "total_count": len(uploaded_files),
        "message": f"{len(uploaded_files)}개 파일 업로드 완료",
        "user_id": current_user["id"] if current_user else None
    }

@app.post("/process")
async def process_image(request: ProcessImageRequest, current_user: Optional[dict] = Depends(get_current_user_optional)):
    """이미지 마스킹 및 데이터 추출 (인증 필요)"""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")
    
    # 원본 이미지 경로
    original_path = os.path.join(UPLOAD_DIR, request.filename)
    if not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    try:
        # 세션 생성 (단일 이미지인 경우, 로그인한 사용자만)
        session_id = str(uuid.uuid4()) if current_user else None
        if current_user and request.session_name:
            session_data = {
                "id": session_id,
                "user_id": current_user["id"],
                "session_name": request.session_name,
                "total_images": 1,
                "status": "active"
            }
            admin_supabase.table("user_sessions").insert(session_data).execute()
        
        # 마스킹된 이미지 경로
        masked_filename = f"masked_{request.filename}"
        masked_path = os.path.join(PROCESSED_DIR, masked_filename)
        
        # 마스킹 적용
        apply_masking(original_path, request.mask_regions, masked_path)
        
        # 이미지 정보
        img = cv2.imread(original_path)
        height, width = img.shape[:2]
        file_size = os.path.getsize(original_path)
        
        # Gemini API로 데이터 추출
        extracted_data = extract_table_data_gemini(api_key, masked_path)
        
        # 결과를 CSV 형식으로 변환
        csv_data = []
        headers = ['파일명', '반출내용', '구매방법', '구매품명', '길이', '개수']
        
        for row in extracted_data.get('rows', []):
            if len(row) < 3:
                continue
                
            반출내용 = row[0] if len(row) > 0 else ''
            구매방법 = row[1] if len(row) > 1 else ''
            구매품명 = row[2] if len(row) > 2 else ''
            
            # 길이-개수 쌍들 처리
            if len(row) >= 5:  # 최소 길이1, 개수1이 있는 경우
                for i in range(3, len(row) - 1, 2):  # 3번째부터 2씩 증가
                    if i + 1 < len(row) and row[i] is not None and row[i+1] is not None:
                        길이 = row[i]
                        개수 = row[i + 1]
                        csv_data.append([request.filename, 반출내용, 구매방법, 구매품명, 길이, 개수])
            else:
                # 길이-개수 정보가 없는 경우 기본 정보만
                csv_data.append([request.filename, 반출내용, 구매방법, 구매품명, '', ''])
        
        # Supabase에 추출 데이터 저장 (로그인한 사용자만)
        if current_user:
            extracted_data_record = {
                "user_id": current_user["id"],
                "session_id": session_id,
                "filename": request.filename,
                "original_filename": request.filename,
                "file_size": file_size,
                "image_width": width,
                "image_height": height,
                "mask_regions": [region.dict() for region in request.mask_regions],
                "raw_extracted_data": extracted_data,
                "processed_csv_data": {"headers": headers, "rows": csv_data},
                "status": "completed"
            }
            
            admin_supabase.table("extracted_data").insert(extracted_data_record).execute()
            
            # 세션 업데이트
            if request.session_name:
                admin_supabase.table("user_sessions").update({
                    "processed_images": 1,
                    "successful_images": 1,
                    "status": "completed"
                }).eq("id", session_id).execute()
        
        return {
            "success": True,
            "filename": request.filename,
            "masked_filename": masked_filename,
            "raw_data": extracted_data,
            "csv_data": csv_data,
            "headers": headers,
            "mask_regions_count": len(request.mask_regions),
            "user_id": current_user["id"] if current_user else None,
            "session_id": session_id
        }
        
    except Exception as e:
        # 오류 발생 시 데이터베이스에 기록 (로그인한 사용자만)
        if current_user and request.session_name:
            try:
                extracted_data_record = {
                    "user_id": current_user["id"],
                    "session_id": session_id,
                    "filename": request.filename,
                    "original_filename": request.filename,
                    "status": "failed",
                    "error_message": str(e)
                }
                admin_supabase.table("extracted_data").insert(extracted_data_record).execute()
                
                admin_supabase.table("user_sessions").update({
                    "processed_images": 1,
                    "failed_images": 1,
                    "status": "completed"
                }).eq("id", session_id).execute()
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"처리 중 오류 발생: {str(e)}")

def process_single_image_for_batch(api_key: str, image_data: ImageMaskData, user_id: str, session_id: str) -> Dict[str, Any]:
    """배치 처리를 위한 단일 이미지 처리 함수"""
    try:
        # 원본 이미지 경로
        original_path = os.path.join(UPLOAD_DIR, image_data.filename)
        if not os.path.exists(original_path):
            raise ValueError(f"파일을 찾을 수 없습니다: {image_data.filename}")
        
        # 마스킹된 이미지 경로
        masked_filename = f"masked_{image_data.filename}"
        masked_path = os.path.join(PROCESSED_DIR, masked_filename)
        
        # 마스킹 적용
        apply_masking(original_path, image_data.mask_regions, masked_path)
        
        # 이미지 정보
        img = cv2.imread(original_path)
        height, width = img.shape[:2]
        file_size = os.path.getsize(original_path)
        
        # Gemini API로 데이터 추출
        extracted_data = extract_table_data_gemini(api_key, masked_path)
        
        return {
            "success": True,
            "filename": image_data.filename,
            "masked_filename": masked_filename,
            "extracted_data": extracted_data,
            "mask_regions_count": len(image_data.mask_regions),
            "width": width,
            "height": height,
            "file_size": file_size,
            "error": None
        }
    except Exception as e:
        return {
            "success": False,
            "filename": image_data.filename,
            "masked_filename": None,
            "extracted_data": None,
            "mask_regions_count": len(image_data.mask_regions) if image_data.mask_regions else 0,
            "error": str(e)
        }

@app.post("/process-multiple")
async def process_multiple_images(request: ProcessMultipleImagesRequest, current_user: Optional[dict] = Depends(get_current_user_optional)):
    """다중 이미지 마스킹 및 데이터 추출 (병렬처리, 인증 선택사항)"""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")
    
    if not request.images:
        raise HTTPException(status_code=400, detail="처리할 이미지가 없습니다.")
    
    try:
        # 세션 생성 (로그인한 사용자만)
        session_id = str(uuid.uuid4()) if current_user else None
        if current_user:
            session_data = {
                "id": session_id,
                "user_id": current_user["id"],
                "session_name": request.session_name or f"Batch Processing {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                "total_images": len(request.images),
                "status": "active"
            }
            admin_supabase.table("user_sessions").insert(session_data).execute()
        
        # 병렬처리를 위한 executor 설정
        max_workers = min(4, len(request.images))  # 최대 4개 동시 처리
        
        # 병렬처리 실행
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 모든 이미지 처리 작업 submit
            future_to_image = {
                executor.submit(process_single_image_for_batch, api_key, image_data, current_user["id"] if current_user else None, session_id): image_data
                for image_data in request.images
            }
            
            # 결과 수집
            results = []
            for future in future_to_image:
                result = future.result()
                results.append(result)
        
        # 성공한 결과들만 모아서 CSV 데이터 생성
        successful_results = [r for r in results if r["success"]]
        failed_results = [r for r in results if not r["success"]]
        
        all_csv_data = []
        headers = ['파일명', '반출내용', '구매방법', '구매품명', '길이', '개수']
        
        # CSV 데이터 처리 (모든 사용자)
        for result in results:
            if result["success"]:
                # CSV 데이터 처리
                extracted_data = result["extracted_data"]
                csv_rows = []
                
                for row in extracted_data.get('rows', []):
                    if len(row) < 3:
                        continue
                        
                    반출내용 = row[0] if len(row) > 0 else ''
                    구매방법 = row[1] if len(row) > 1 else ''
                    구매품명 = row[2] if len(row) > 2 else ''
                    
                    # 길이-개수 쌍들 처리
                    if len(row) >= 5:  # 최소 길이1, 개수1이 있는 경우
                        for i in range(3, len(row) - 1, 2):  # 3번째부터 2씩 증가
                            if i + 1 < len(row) and row[i] is not None and row[i+1] is not None:
                                길이 = row[i]
                                개수 = row[i + 1]
                                csv_row = [result["filename"], 반출내용, 구매방법, 구매품명, 길이, 개수]
                                csv_rows.append(csv_row)
                                all_csv_data.append(csv_row)
                    else:
                        # 길이-개수 정보가 없는 경우 기본 정보만
                        csv_row = [result["filename"], 반출내용, 구매방법, 구매품명, '', '']
                        csv_rows.append(csv_row)
                        all_csv_data.append(csv_row)

        # 데이터베이스에 저장 (로그인한 사용자만)
        if current_user:
            for result in results:
                try:
                    extracted_data_record = {
                        "user_id": current_user["id"],
                        "session_id": session_id,
                        "filename": result["filename"],
                        "original_filename": result["filename"],
                        "mask_regions": [region.dict() for region in next((img.mask_regions for img in request.images if img.filename == result["filename"]), [])],
                        "status": "completed" if result["success"] else "failed"
                    }
                    
                    if result["success"]:
                        extracted_data_record.update({
                            "file_size": result["file_size"],
                            "image_width": result["width"],
                            "image_height": result["height"],
                            "raw_extracted_data": result["extracted_data"]
                        })
                        
                        # CSV 데이터는 위에서 처리한 것을 사용
                        csv_rows = []
                        extracted_data = result["extracted_data"]
                        for row in extracted_data.get('rows', []):
                            if len(row) < 3:
                                continue
                            반출내용 = row[0] if len(row) > 0 else ''
                            구매방법 = row[1] if len(row) > 1 else ''
                            구매품명 = row[2] if len(row) > 2 else ''
                            if len(row) >= 5:
                                for i in range(3, len(row) - 1, 2):
                                    if i + 1 < len(row) and row[i] is not None and row[i+1] is not None:
                                        길이 = row[i]
                                        개수 = row[i + 1]
                                        csv_rows.append([result["filename"], 반출내용, 구매방법, 구매품명, 길이, 개수])
                            else:
                                csv_rows.append([result["filename"], 반출내용, 구매방법, 구매품명, '', ''])
                        
                        extracted_data_record["processed_csv_data"] = {"headers": headers, "rows": csv_rows}
                    else:
                        extracted_data_record["error_message"] = result["error"]
                    
                    admin_supabase.table("extracted_data").insert(extracted_data_record).execute()
                    
                except Exception as e:
                    print(f"Error saving data for {result['filename']}: {str(e)}")
            
            # 세션 업데이트 (로그인한 사용자만)
            if session_id:
                admin_supabase.table("user_sessions").update({
                    "processed_images": len(results),
                    "successful_images": len(successful_results),
                    "failed_images": len(failed_results),
                    "status": "completed"
                }).eq("id", session_id).execute()
        
        return {
            "success": True,
            "total_images": len(request.images),
            "successful_images": len(successful_results),
            "failed_images": len(failed_results),
            "headers": headers,
            "csv_data": all_csv_data,
            "results": results,
            "failed_files": [r["filename"] for r in failed_results] if failed_results else [],
            "user_id": current_user["id"] if current_user else None,
            "session_id": session_id
        }
        
    except Exception as e:
        # 세션 상태를 실패로 업데이트
        try:
            admin_supabase.table("user_sessions").update({
                "status": "cancelled"
            }).eq("id", session_id).execute()
        except:
            pass
        
        raise HTTPException(status_code=500, detail=f"일괄 처리 중 오류 발생: {str(e)}")

@app.get("/files/{filename}")
async def get_file_info(filename: str):
    """업로드된 파일 정보 조회"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    # 이미지 크기 정보 가져오기
    img = cv2.imread(file_path)
    height, width = img.shape[:2]
    
    return {
        "filename": filename,
        "width": width,
        "height": height,
        "file_path": file_path
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
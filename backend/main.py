from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Tuple
import cv2
import numpy as np
import os
import tempfile
import json
import re
from datetime import datetime
import shutil
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

app = FastAPI(title="Transcript Change API", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드된 파일 저장 디렉토리
UPLOAD_DIR = "uploads"
PROCESSED_DIR = "processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

# 정적 파일 서빙 설정
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")

class MaskRegion(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

class ProcessImageRequest(BaseModel):
    filename: str
    mask_regions: List[MaskRegion]

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

@app.get("/")
async def root():
    return {"message": "Transcript Change API"}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """이미지 파일 업로드"""
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
        "file_path": file_path
    }

@app.post("/process")
async def process_image(request: ProcessImageRequest):
    """이미지 마스킹 및 데이터 추출"""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY가 설정되지 않았습니다.")
    
    # 원본 이미지 경로
    original_path = os.path.join(UPLOAD_DIR, request.filename)
    if not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    try:
        # 마스킹된 이미지 경로
        masked_filename = f"masked_{request.filename}"
        masked_path = os.path.join(PROCESSED_DIR, masked_filename)
        
        # 마스킹 적용
        apply_masking(original_path, request.mask_regions, masked_path)
        
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
        
        return {
            "success": True,
            "filename": request.filename,
            "masked_filename": masked_filename,
            "raw_data": extracted_data,
            "csv_data": csv_data,
            "headers": headers,
            "mask_regions_count": len(request.mask_regions)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"처리 중 오류 발생: {str(e)}")

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
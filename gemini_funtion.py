import os
import glob
import csv
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

def extract_table_data_gemini(api_key, image_path: str):
    """표 형식 이미지에서 데이터를 추출하는 함수"""
    from google import genai
    from google.genai import types
    import json
    import re
    
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


def extract_table_data_from_folder(api_key, folder_path: str, max_workers: int = 4):
    """폴더 내 모든 이미지에서 표 데이터를 추출하는 함수 (병렬처리)
    
    Args:
        api_key: Gemini API 키
        folder_path: 이미지 파일들이 있는 폴더 경로
        max_workers: 동시 처리할 최대 스레드 수 (기본값: 4)
    """
    import mimetypes
    
    start_time = time.time()
    
    # 지원하는 이미지 확장자
    supported_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
    
    # 폴더가 존재하는지 확인
    if not os.path.exists(folder_path):
        raise FileNotFoundError(f"폴더를 찾을 수 없습니다: {folder_path}")
    
    if not os.path.isdir(folder_path):
        raise ValueError(f"경로가 폴더가 아닙니다: {folder_path}")
    
    # 폴더 내 이미지 파일 찾기
    image_files = set()  # 중복 제거를 위해 set 사용
    for ext in supported_extensions:
        pattern = os.path.join(folder_path, f"*{ext}")
        image_files.update(glob.glob(pattern, recursive=False))
        pattern = os.path.join(folder_path, f"*{ext.upper()}")
        image_files.update(glob.glob(pattern, recursive=False))
    
    image_files = list(image_files)  # 다시 리스트로 변환
    
    if not image_files:
        print(f"폴더에서 이미지 파일을 찾을 수 없습니다: {folder_path}")
        return {"headers": [], "rows": [], "file_results": []}
    
    print(f"발견된 이미지 파일: {len(image_files)}개")
    
    # 병렬처리를 위한 함수
    def process_single_file(image_file):
        """단일 파일을 처리하는 함수"""
        try:
            import mimetypes
            
            # MIME 타입 감지
            mime_type, _ = mimetypes.guess_type(image_file)
            if not mime_type or not mime_type.startswith('image/'):
                mime_type = 'image/png'  # 기본값
            
            result = extract_single_image(api_key, image_file, mime_type)
            filename = os.path.basename(image_file)
            
            return {
                "success": True,
                "filename": filename,
                "filepath": image_file,
                "result": result,
                "error": None
            }
            
        except Exception as e:
            return {
                "success": False,
                "filename": os.path.basename(image_file),
                "filepath": image_file,
                "result": None,
                "error": str(e)
            }
    
    # 병렬처리로 모든 이미지 처리
    all_rows = []
    headers = None
    file_results = []
    completed_count = 0
    
    # 최대 동시 처리 수 조정 (파일 수와 사용자 설정 중 작은 값)
    actual_workers = min(max_workers, len(image_files))
    
    print(f"병렬처리 시작 (동시 처리: {actual_workers}개)")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 모든 파일에 대해 작업 submit
        future_to_file = {
            executor.submit(process_single_file, image_file): image_file 
            for image_file in sorted(image_files)
        }
        
        # 완료된 작업들을 처리
        for future in as_completed(future_to_file):
            completed_count += 1
            image_file = future_to_file[future]
            
            try:
                file_result = future.result()
                filename = file_result["filename"]
                
                print(f"완료: {filename} ({completed_count}/{len(image_files)})")
                
                if file_result["success"]:
                    result = file_result["result"]
                    
                    # 헤더 설정 (첫 번째 성공한 이미지에서)
                    if headers is None:
                        headers = result.get("headers", [])
                    
                    # 행 추가 (파일명 정보도 함께)
                    rows = result.get("rows", [])
                    for row in rows:
                        all_rows.append({
                            "source_file": filename,
                            "data": row
                        })
                    
                    # 파일별 결과 저장
                    file_results.append({
                        "filename": filename,
                        "filepath": file_result["filepath"],
                        "rows_count": len(rows),
                        "success": True
                    })
                else:
                    print(f"에러 - {filename}: {file_result['error']}")
                    file_results.append({
                        "filename": filename,
                        "filepath": file_result["filepath"],
                        "rows_count": 0,
                        "success": False,
                        "error": file_result["error"]
                    })
                    
            except Exception as e:
                filename = os.path.basename(image_file)
                print(f"처리 중 예외 발생 - {filename}: {str(e)}")
                file_results.append({
                    "filename": filename,
                    "filepath": image_file,
                    "rows_count": 0,
                    "success": False,
                    "error": str(e)
                })
    
    end_time = time.time()
    processing_time = end_time - start_time
    
    print(f"\n병렬처리 완료!")
    print(f"처리 시간: {processing_time:.2f}초")
    print(f"평균 처리 시간: {processing_time/len(image_files):.2f}초/파일")
    
    return {
        "headers": headers or [],
        "rows": all_rows,
        "total_files": len(image_files),
        "successful_files": len([r for r in file_results if r["success"]]),
        "file_results": file_results,
        "processing_time": processing_time
    }


def extract_single_image(api_key, image_path: str, mime_type: str = None):
    """단일 이미지에서 표 데이터를 추출하는 함수 (내부 사용)"""
    from google import genai
    from google.genai import types
    import json
    import re
    import mimetypes
    
    # MIME 타입 자동 감지
    if mime_type is None:
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type or not mime_type.startswith('image/'):
            mime_type = 'image/png'  # 기본값
    
    client = genai.Client(api_key=api_key)
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
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


def save_results_to_csv(result, output_path=None):
    """결과를 CSV 파일로 저장"""
    if not result['rows']:
        print("저장할 데이터가 없습니다.")
        return
    
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"extracted_data_{timestamp}.csv"
    
    headers = ['파일명', '반출내용', '구매방법', '구매품명', '길이', '개수']
    
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(headers)
        
        for row_data in result['rows']:
            filename = row_data['source_file']
            data = row_data['data']
            
            if len(data) < 3:
                continue
                
            반출내용 = data[0] if len(data) > 0 else ''
            구매방법 = data[1] if len(data) > 1 else ''
            구매품명 = data[2] if len(data) > 2 else ''
            
            # 길이-개수 쌍들 처리
            if len(data) >= 5:  # 최소 길이1, 개수1이 있는 경우
                for i in range(3, len(data) - 1, 2):  # 3번째부터 2씩 증가
                    if i + 1 < len(data) and data[i] is not None and data[i+1] is not None:
                        길이 = data[i]
                        개수 = data[i + 1]
                        writer.writerow([filename, 반출내용, 구매방법, 구매품명, 길이, 개수])
            else:
                # 길이-개수 정보가 없는 경우 기본 정보만
                writer.writerow([filename, 반출내용, 구매방법, 구매품명, '', ''])
    
    print(f"CSV 파일 저장 완료: {output_path}")
    return output_path


if __name__ == "__main__":
    # API 키 설정 (환경변수에서 가져오거나 직접 입력)
    api_key = os.getenv('GEMINI_API_KEY')
    
    if not api_key:
        api_key = input("Gemini API 키를 입력하세요: ")
    
    if api_key:
        # 병렬처리 설정
        print("=== 병렬처리 설정 ===")
        try:
            max_workers = int(input("동시 처리할 스레드 수를 입력하세요 (기본값: 4, 추천: 2-6): ") or "4")
            if max_workers < 1:
                max_workers = 4
                print("잘못된 값입니다. 기본값 4를 사용합니다.")
        except ValueError:
            max_workers = 4
            print("잘못된 입력입니다. 기본값 4를 사용합니다.")
        
        # 폴더 내 모든 이미지 처리
        result = extract_table_data_from_folder(
            api_key, 
            "C:/Users/Alpha/Projects/transcript-change/img",
            max_workers=max_workers
        )
        
        print(f"\n=== 처리 결과 ===")
        print(f"총 파일 수: {result['total_files']}")
        print(f"성공한 파일 수: {result['successful_files']}")
        print(f"총 데이터 행 수: {len(result['rows'])}")
        
        print(f"\n=== 헤더 ===")
        print(result['headers'])
        
        print(f"\n=== 추출된 데이터 ===")
        for i, row_data in enumerate(result['rows'], 1):
            print(f"행 {i} ({row_data['source_file']}): {row_data['data']}")
        
        print(f"\n=== 파일별 처리 결과 ===")
        for file_result in result['file_results']:
            status = "성공" if file_result['success'] else "실패"
            print(f"- {file_result['filename']}: {status} (행 수: {file_result['rows_count']})")
            if not file_result['success']:
                print(f"  에러: {file_result.get('error', '알 수 없는 에러')}")
        
        # CSV 파일로 자동 저장
        print(f"\n=== CSV 저장 중 ===")
        save_results_to_csv(result)
    else:
        print("API 키가 필요합니다.")
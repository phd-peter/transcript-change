import os
import csv
from datetime import datetime
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





def save_results_to_csv(result, filename, output_path=None):
    """결과를 CSV 파일로 저장"""
    if not result.get('rows'):
        print("저장할 데이터가 없습니다.")
        return
    
    if output_path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = f"extracted_data_{timestamp}.csv"
    
    headers = ['파일명', '반출내용', '구매방법', '구매품명', '길이', '개수']
    
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(headers)
        
        for data in result['rows']:
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
    
    if not api_key:
        print("API 키가 필요합니다.")
        exit()
    
    # 이미지 파일 경로 입력
    image_path = input("처리할 이미지 파일 경로를 입력하세요: ")
    
    if not os.path.exists(image_path):
        print(f"파일이 존재하지 않습니다: {image_path}")
        exit()
    
    try:
        print(f"이미지 처리 중: {image_path}")
        
        # 단일 이미지 처리
        result = extract_table_data_gemini(api_key, image_path)
        
        print(f"\n=== 처리 결과 ===")
        print(f"헤더: {result['headers']}")
        print(f"데이터 행 수: {len(result['rows'])}")
        
        print(f"\n=== 추출된 데이터 ===")
        for i, row in enumerate(result['rows'], 1):
            print(f"행 {i}: {row}")
        
        # CSV 파일로 저장
        print(f"\n=== CSV 저장 중 ===")
        filename = os.path.basename(image_path)
        csv_path = save_results_to_csv(result, filename)
        print(f"처리 완료!")
        
    except Exception as e:
        print(f"처리 중 오류 발생: {str(e)}")
import cv2

# 이미지 불러오기
img = cv2.imread('C:/Users/Alpha/Projects/transcript-change/img/num3.jpg')

# 마스킹할 구역들 (점 2개씩 매칭: 좌상단, 우하단)
mask_regions = [
    ((92, 882), (250, 1330)),   # 영역 1
    ((254, 842), (424, 1338)),  # 영역 2
    ((410, 698), (594, 1314)),  # 영역 3
    ((578, 484), (930, 1338)),  # 영역 4
]

# 마스킹 실행
for i, (point1, point2) in enumerate(mask_regions, 1):
    x1, y1 = point1  # 좌상단
    x2, y2 = point2  # 우하단
    
    # 좌표 정렬 (좌상단이 실제로 좌상단이 되도록)
    x1, x2 = min(x1, x2), max(x1, x2)
    y1, y2 = min(y1, y2), max(y1, y2)
    
    print(f"영역 {i}: ({x1}, {y1}) ~ ({x2}, {y2})")
    cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), -1)

# 결과 저장
cv2.imwrite("masked_output_coordinates.jpg", img)
print("마스킹 완료! 결과: masked_output_coordinates.jpg")
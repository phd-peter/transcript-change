import cv2

# 이미지 불러오기
img = cv2.imread('C:/Users/Alpha/Projects/transcript-change/img/num3.jpg')
clone = img.copy()

# 화면 크기에 맞게 리사이즈 (비율 고정)
scale = 0.5  # 50%로 축소 (필요 시 조절)
resized = cv2.resize(clone, None, fx=scale, fy=scale)

# 좌표 기록 시 원본 비율로 환산하기 위한 역산 비율
inv_scale = 1 / scale

def click_event(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # 원본 기준 좌표로 환산
        orig_x, orig_y = int(x * inv_scale), int(y * inv_scale)
        print(f"Clicked at: x={orig_x}, y={orig_y}")

        # 클릭 표시
        cv2.circle(resized, (x, y), 3, (0, 0, 255), -1)
        cv2.putText(resized, f"{orig_x},{orig_y}", (x+5, y-5), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,0,255), 1)
        cv2.imshow("resized image", resized)

cv2.imshow("resized image", resized)
cv2.setMouseCallback("resized image", click_event)
cv2.waitKey(0)
cv2.destroyAllWindows()
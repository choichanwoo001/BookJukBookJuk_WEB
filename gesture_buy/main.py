import cv2
import time
import mediapipe as mp
import mediapipe.python.solutions.hands as mp_hands
import mediapipe.python.solutions.drawing_utils as mp_drawing
from detector import BookDetector
from gesture import is_buy_gesture, is_holding_book

def main():
    # 1. 초기화
    cap = cv2.VideoCapture(0)
    
    # 최대 2개의 손(왼손/오른손) 추적
    hands = mp_hands.Hands(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        max_num_hands=2
    )
    
    # YOLO 모델 초기화
    detector = BookDetector()
    
    last_event_time = 0
    cooldown_seconds = 1.5
    event_active_until = 0

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("웹캠 프레임을 읽을 수 없습니다.")
            break
            
        # 직관적인 거울 모드를 위해 좌우 반전
        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape
        
        # MediaPipe는 RGB 이미지를 사용하므로 BGR에서 변환합니다.
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # 1. YOLOv8을 이용하여 화면 내의 책(book) 감지
        book_boxes = detector.detect(frame)
        
        # 2. MediaPipe 손(랜드마크) 감지
        results = hands.process(rgb_frame)
        
        left_holding = False
        right_buying = False
        holding_box = None
        
        if results.multi_hand_landmarks and results.multi_handedness:
            for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
                # 거울 모드(좌우 반전)일 때 'Left' 라벨은 실제 사용자의 왼손
                label = handedness.classification[0].label # "Left" or "Right"
                
                # 양손 스켈레톤 시각화
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                
                # 왼손 조건 검사: 책을 들고 있는지 여부
                if label == "Left":
                    is_held, box = is_holding_book(hand_landmarks, book_boxes, frame.shape)
                    if is_held:
                        left_holding = True
                        holding_box = box
                        
                # 오른손 조건 검사: 'BUY' 제스처 여부
                elif label == "Right":
                    if is_buy_gesture(hand_landmarks):
                        right_buying = True
                        
        # 3. 구매 의도(BUY INTENT) 이벤트 감지
        current_time = time.time()
        # 두 조건이 AND로 만족될 때
        if left_holding and right_buying:
            if current_time - last_event_time > cooldown_seconds:
                print("📚 구매 의도 감지! (BUY_INTENT)")
                last_event_time = current_time
                event_active_until = current_time + 1.5  # 1.5초간 오버레이 유지
                
        # 4. 시각화 업데이트
        
        # 감지된 Book Bound Box 표시
        for box in book_boxes:
            x1, y1, x2, y2 = box
            color = (0, 255, 0) # 기본 초록색
            # 책을 쥐고 있는 것으로 판별되면 색을 파란색/빨간색 계열 등으로 변경하여 시각적 분리
            if holding_box == box:
                color = (0, 0, 255) # 빨간색
                
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, "Book", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
        # 화면 좌측 상단에 실시간 상태 현황 출력
        cv2.putText(frame, f"Left Hand Holding Book: {left_holding}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
        cv2.putText(frame, f"Right Hand Buy Gesture: {right_buying}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
        
        # 이벤트 감지 시 정중앙에 큰 오버레이 텍스트 출력
        if time.time() < event_active_until:
            cv2.putText(frame, "BUY INTENT DETECTED!", (50, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)

        cv2.imshow("Gesture Buy System", frame)
        
        # 'q' 키를 누르면 종료
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()
    hands.close()

if __name__ == "__main__":
    main()

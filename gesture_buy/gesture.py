def is_buy_gesture(hand_landmarks):
    """
    오른손이 "사다(BUY)" 제스처를 취하고 있는지 판별합니다.
    조건: 검지만 펴져 있고, 나머지 손가락(중지, 약지, 소지)은 접혀 있는 상태
    
    참고: MediaPipe의 랜드마크 y 좌표는 위에서 아래로 증가합니다.
          따라서 y값이 작을수록 화면 상단에 위치합니다.
    """
    lm = hand_landmarks.landmark
    
    # 검지(Index): 끝부분(8)이 중간 마디(6)보다 위에 있음 (펴짐)
    index_open = lm[8].y < lm[6].y
    
    # 중지(Middle): 끝부분(12)이 중간 마디(10)보다 아래에 있음 (접힘)
    middle_folded = lm[12].y > lm[10].y
    
    # 약지(Ring): 끝부분(16)이 중간 마디(14)보다 아래에 있음 (접힘)
    ring_folded = lm[16].y > lm[14].y
    
    # 소지(Pinky): 끝부분(20)이 중간 마디(18)보다 아래에 있음 (접힘)
    pinky_folded = lm[20].y > lm[18].y
    
    return index_open and middle_folded and ring_folded and pinky_folded

def is_holding_book(hand_landmarks, book_boxes, frame_shape):
    """
    왼손이 책(book)을 들고 있는지 판별합니다.
    조건: 왼손의 0번 랜드마크(WRIST)가 하나라도 감지된 book 박스 내부에 포함되면 True를 반환.
    
    Args:
        hand_landmarks: MediaPipe의 손 랜드마크 객체
        book_boxes: YOLO로 감지된 책의 bounding box 리스트 [(x1, y1, x2, y2), ...]
        frame_shape: 카메라 프레임의 크기 (높이, 너비, 채널)
        
    Returns:
        bool: 책을 들고 있는지 여부
        tuple: 들고 있는 책의 바운딩 박스 (없으면 None)
    """
    h, w, _ = frame_shape
    
    # MediaPipe 랜드마크는 0.0 ~ 1.0로 정규화되어 있으므로 해상도에 맞춰 픽셀화합니다.
    wrist = hand_landmarks.landmark[0]
    wrist_x, wrist_y = int(wrist.x * w), int(wrist.y * h)
    
    for box in book_boxes:
        x1, y1, x2, y2 = box
        # 손목 좌표가 박스 영역 내부에 들어왔는지 확인
        if x1 <= wrist_x <= x2 and y1 <= wrist_y <= y2:
            return True, box
            
    return False, None

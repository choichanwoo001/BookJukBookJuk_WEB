from ultralytics import YOLO

class BookDetector:
    def __init__(self, model_path="yolov8n.pt"):
        """
        초기화 시 YOLOv8 모델을 로드합니다.
        COCO dataset에서 'book'의 클래스 ID는 73입니다.
        """
        self.model = YOLO(model_path)
        self.book_class_id = 73

    def detect(self, frame):
        """
        주어진 프레임에서 책(book)의 바운딩 박스 목록을 반환합니다.
        
        Args:
            frame: OpenCV 프레임 (BGR)
            
        Returns:
            books: 감지된 책들의 바운딩 박스 리스트 [(x1, y1, x2, y2), ...]
        """
        # verbose=False를 통해 콘솔 출력 최소화
        results = self.model.predict(source=frame, classes=[self.book_class_id], verbose=False)
        
        books = []
        if len(results) > 0:
            boxes = results[0].boxes
            for box in boxes:
                # 바운딩 박스 좌표 추출 (x1, y1, x2, y2)
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                books.append((x1, y1, x2, y2))
                
        return books

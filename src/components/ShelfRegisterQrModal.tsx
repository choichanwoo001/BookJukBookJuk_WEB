import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { Receipt } from '../agent/types'

type ShelfRegisterQrModalProps = {
  receipt: Receipt
  onClose: () => void
}

export function ShelfRegisterQrModal({ receipt, onClose }: ShelfRegisterQrModalProps) {
  return createPortal(
    <div className="shelfRegisterOverlay" role="dialog" aria-label="앱 책장 등록 QR" aria-modal="true">
      <div className="shelfRegisterOverlayCard">
        <div className="shelfRegisterOverlayHead">
          <span className="shelfRegisterBrand">앱 책장 등록</span>
          <strong>{receipt.items.length}권</strong>
        </div>

        <section className="shelfRegisterBookList" aria-label="등록될 책 목록">
          <h3 className="shelfRegisterBookListTitle">등록될 책</h3>
          <ul className="shelfRegisterBookListItems">
            {receipt.items.map((book) => (
              <li key={book.booksId} className="shelfRegisterBookListItem" title={book.title}>
                {book.title}
              </li>
            ))}
          </ul>
        </section>

        <div className="shelfRegisterOverlayQr" aria-hidden>
          <QRCodeSVG
            value={receipt.qrPayload}
            size={220}
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#163528"
          />
        </div>
        <p className="shelfRegisterOverlayFootnote">
          QR은 결제 영수증과 연결돼 있어요. 앱이 영수증을 확인한 뒤 책장에 등록합니다.
        </p>

        <button type="button" className="shelfRegisterCloseButton" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>,
    document.body,
  )
}

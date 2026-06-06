import { useMemo, useState } from 'react'
import { defaultTasteSeed, rankReaderProfiles } from '../data/readerProfiles'
import type { ShoppingListEntry } from '../agent/types'
import type { ReaderBook, ReaderProfile, TasteSeed } from '../types/onboarding'
import { partitionReaderBookEntries, planEntryFromReaderBook } from '../utils/similarReadersPlan'

type SimilarReadersGateProps = {
  tasteSeed: TasteSeed | null
  usersId: string | null
  plannedBooks: ShoppingListEntry[]
  onAddBooks: (books: ShoppingListEntry[]) => void
  onRemoveBooks: (books: ShoppingListEntry[]) => void
  onClearPlannedBooks: () => void
  onStart: () => void
}

type BookTab = 'liked' | 'read'

function Avatar({ profile }: { profile: ReaderProfile }) {
  return (
    <div className={`readerAvatar readerAvatar-${profile.avatarTone}`} aria-hidden>
      <span>{profile.name.slice(0, 1)}</span>
    </div>
  )
}

function BookCover({ book }: { book: ReaderBook }) {
  if (book.coverUrl) {
    return <img className="readerBookCover" src={book.coverUrl} alt="" loading="lazy" />
  }
  return (
    <div className="readerBookCover readerBookCoverPlaceholder" aria-hidden>
      <span>{book.title.slice(0, 8)}</span>
    </div>
  )
}

function uniqueReaderBooks(profile: ReaderProfile) {
  const seen = new Set<string>()
  const books: ReaderBook[] = []
  for (const book of [...profile.likedBooks, ...profile.readBooks]) {
    const key = `${book.title.trim()}-${book.author.trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    books.push(book)
  }
  return books
}

export default function SimilarReadersGate({
  tasteSeed,
  usersId,
  plannedBooks,
  onAddBooks,
  onRemoveBooks,
  onClearPlannedBooks,
  onStart,
}: SimilarReadersGateProps) {
  const rankedProfiles = useMemo(() => rankReaderProfiles(tasteSeed ?? defaultTasteSeed), [tasteSeed])
  const [selectedId, setSelectedId] = useState(rankedProfiles[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<BookTab>('liked')
  const selectedProfile = rankedProfiles.find((profile) => profile.id === selectedId) ?? rankedProfiles[0]
  const activeBooks = activeTab === 'liked' ? selectedProfile.likedBooks : selectedProfile.readBooks
  const plannedBookIds = useMemo(() => new Set(plannedBooks.map((book) => book.booksId)), [plannedBooks])
  const activePlannedCount = activeBooks.filter((book) =>
    plannedBookIds.has(planEntryFromReaderBook(selectedProfile, book).booksId),
  ).length
  const activeUnplannedCount = activeBooks.length - activePlannedCount
  const allReaderBooks = uniqueReaderBooks(selectedProfile)
  const readerPlannedCount = allReaderBooks.filter((book) =>
    plannedBookIds.has(planEntryFromReaderBook(selectedProfile, book).booksId),
  ).length
  const readerUnplannedCount = allReaderBooks.length - readerPlannedCount

  const addReaderBooks = (books: ReaderBook[]) => {
    const { toAdd } = partitionReaderBookEntries(selectedProfile, books, plannedBookIds)
    if (toAdd.length > 0) onAddBooks(toAdd)
  }

  const removeReaderBooks = (books: ReaderBook[]) => {
    const { toRemove } = partitionReaderBookEntries(selectedProfile, books, plannedBookIds)
    if (toRemove.length > 0) onRemoveBooks(toRemove)
  }

  const handleBookPlanClick = (book: ReaderBook) => {
    const entry = planEntryFromReaderBook(selectedProfile, book)
    if (plannedBookIds.has(entry.booksId)) onRemoveBooks([entry])
    else onAddBooks([entry])
  }

  return (
    <section className="similarReadersPage" aria-label="비슷한 독자 추천">
      <header className="similarReadersHeader">
        <div>
          <p className="onboardingEyebrow">Taste match</p>
          <h1>나와 비슷하게 읽은 사람들</h1>
          <p>내 독서 기록과 비슷한 취향을 가진 독자들이에요.</p>
        </div>
        <div className="similarReadersControls">
          <span>{plannedBooks.length}권 담김</span>
          {plannedBooks.length > 0 && (
            <button type="button" className="readerPlanClearButton" onClick={onClearPlannedBooks}>
              {plannedBooks.length}권 전체 비우기
            </button>
          )}
          <span>{usersId ? `연결된 사용자 ${usersId}` : `${tasteSeed?.tone ?? defaultTasteSeed.tone} 취향 분석`}</span>
          <button type="button" className="onboardingCtaPrimary" onClick={onStart}>
            이 독자 취향으로 시작
          </button>
        </div>
      </header>

      <div className="similarReadersLayout">
        <aside className="readerListPanel" aria-label="비슷한 독자 목록">
          <div className="readerListScroller">
            {rankedProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="readerListCard"
                data-active={profile.id === selectedProfile.id}
                onClick={() => {
                  setSelectedId(profile.id)
                  setActiveTab('liked')
                }}
              >
                <Avatar profile={profile} />
                <div className="readerListBody">
                  <strong>{profile.name}</strong>
                  <span>{profile.tagline}</span>
                  <p>
                    취향 유사도 <b>{profile.similarity}%</b>
                  </p>
                  <ul>
                    {profile.reasons.slice(0, 1).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <article className="readerDetailPanel">
          <div className="readerDetailHero">
            <Avatar profile={selectedProfile} />
            <div>
              <p className="readerDetailKicker">나와의 취향 유사도</p>
              <h2>{selectedProfile.name}</h2>
              <p className="readerDetailSimilarity">{selectedProfile.similarity}%</p>
              <p className="readerDetailDescription">{selectedProfile.description}</p>
              <div className="readerPlanActions">
                {activeUnplannedCount > 0 && (
                  <button type="button" onClick={() => addReaderBooks(activeBooks)}>
                    현재 탭 {activeUnplannedCount}권 담기
                  </button>
                )}
                {activePlannedCount > 0 && (
                  <button type="button" className="readerPlanRemoveButton" onClick={() => removeReaderBooks(activeBooks)}>
                    현재 탭 {activePlannedCount}권 담기 취소
                  </button>
                )}
                {readerUnplannedCount > 0 && (
                  <button type="button" onClick={() => addReaderBooks(allReaderBooks)}>
                    이 독자 전체 {readerUnplannedCount}권 담기
                  </button>
                )}
                {readerPlannedCount > 0 && (
                  <button type="button" className="readerPlanRemoveButton" onClick={() => removeReaderBooks(allReaderBooks)}>
                    이 독자 {readerPlannedCount}권 담기 취소
                  </button>
                )}
                <span>
                  이 탭 {activePlannedCount}/{activeBooks.length}권 담김
                </span>
              </div>
            </div>
          </div>

          <section className="readerReasonBox" aria-label="왜 비슷한가요">
            <strong>왜 비슷한가요?</strong>
            <div className="readerReasonGrid">
              {selectedProfile.reasons.slice(0, 3).map((reason, index) => (
                <p key={reason}>
                  <span aria-hidden>{index === 0 ? '책' : index === 1 ? '마음' : '문장'}</span>
                  {reason}
                </p>
              ))}
            </div>
          </section>

          <div className="readerBookTabs" role="tablist" aria-label="독자 책 목록">
            <button type="button" role="tab" aria-selected={activeTab === 'liked'} onClick={() => setActiveTab('liked')}>
              이 독자가 좋게 평가한 책
            </button>
            <button type="button" role="tab" aria-selected={activeTab === 'read'} onClick={() => setActiveTab('read')}>
              이 독자가 읽은 책
            </button>
          </div>

          <div className="readerBooksGrid">
            {activeBooks.map((book) => {
              const isAdded = plannedBookIds.has(planEntryFromReaderBook(selectedProfile, book).booksId)
              return (
                <article key={book.id} className="readerBookCard">
                  <BookCover book={book} />
                  <h3>{book.title}</h3>
                  <p className="readerBookAuthor">{book.author}</p>
                  {book.rating && (
                    <p className="readerBookRating">
                      별점 {book.rating.toFixed(1)}
                      {book.reviewCount ? ` (${book.reviewCount})` : ''}
                    </p>
                  )}
                  <strong>추천 이유</strong>
                  <p>{book.reason}</p>
                  <button
                    type="button"
                    className="readerBookAddButton"
                    data-added={isAdded}
                    onClick={() => handleBookPlanClick(book)}
                  >
                    {isAdded ? '담기 취소' : '책 담기'}
                  </button>
                </article>
              )
            })}
          </div>
        </article>
      </div>
    </section>
  )
}

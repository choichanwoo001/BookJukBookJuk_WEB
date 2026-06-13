import { useMemo, useState } from 'react'
import { defaultTasteSeed, rankReaderProfiles } from '../data/readerProfiles'
import type { ShoppingListEntry } from '../agent/types'
import type { ReaderBook, ReaderProfile, TasteSeed } from '../types/onboarding'
import { partitionReaderBookEntries, planEntryFromReaderBook } from '../utils/similarReadersPlan'
import AppButton from './AppButton'

type SimilarReadersGateProps = {
  tasteSeed: TasteSeed | null
  plannedBooks: ShoppingListEntry[]
  onAddBooks: (books: ShoppingListEntry[]) => void
  onRemoveBooks: (books: ShoppingListEntry[]) => void
  onStart: () => void
}

type BookTab = 'liked' | 'read'

function Avatar({ profile }: { profile: ReaderProfile }) {
  if (profile.avatarUrl) {
    return (
      <div className={`readerAvatar readerAvatar-${profile.avatarTone}`} aria-hidden>
        <img className="readerAvatarImage" src={profile.avatarUrl} alt="" loading="lazy" />
      </div>
    )
  }
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
  plannedBooks,
  onAddBooks,
  onRemoveBooks,
  onStart,
}: SimilarReadersGateProps) {
  const rankedProfiles = useMemo(() => rankReaderProfiles(tasteSeed ?? defaultTasteSeed), [tasteSeed])
  const [selectedId, setSelectedId] = useState(rankedProfiles[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<BookTab>('liked')
  const canStartWithPlannedBooks = plannedBooks.length > 0
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
                <strong className="readerListName">{profile.name}</strong>
                <Avatar profile={profile} />
                <div className="readerListBody">
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
              <div className="readerDetailHeroHeader">
                <p className="readerDetailKicker">나와의 취향 유사도</p>
                <h2>{selectedProfile.name}</h2>
                <p className="readerDetailSimilarity">{selectedProfile.similarity}%</p>
              </div>
              <p className="readerDetailDescription">{selectedProfile.description}</p>
              <div className="readerPlanActions">
                {activeUnplannedCount > 0 && (
                  <AppButton variant="secondary" onClick={() => addReaderBooks(activeBooks)}>
                    현재 탭 {activeUnplannedCount}권 담기
                  </AppButton>
                )}
                {activePlannedCount > 0 && (
                  <AppButton variant="danger" onClick={() => removeReaderBooks(activeBooks)}>
                    현재 탭 {activePlannedCount}권 담기 취소
                  </AppButton>
                )}
                {readerUnplannedCount > 0 && (
                  <AppButton variant="secondary" onClick={() => addReaderBooks(allReaderBooks)}>
                    이 독자 전체 {readerUnplannedCount}권 담기
                  </AppButton>
                )}
                {readerPlannedCount > activePlannedCount && (
                  <AppButton variant="danger" onClick={() => removeReaderBooks(allReaderBooks)}>
                    이 독자 {readerPlannedCount}권 담기 취소
                  </AppButton>
                )}
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
            <AppButton
              variant="tab"
              role="tab"
              active={activeTab === 'liked'}
              aria-selected={activeTab === 'liked'}
              onClick={() => setActiveTab('liked')}
            >
              이 독자가 좋게 평가한 책
            </AppButton>
            <AppButton
              variant="tab"
              role="tab"
              active={activeTab === 'read'}
              aria-selected={activeTab === 'read'}
              onClick={() => setActiveTab('read')}
            >
              이 독자가 읽은 책
            </AppButton>
          </div>

          <div className="readerBooksGrid">
            {activeBooks.map((book) => {
              const isAdded = plannedBookIds.has(planEntryFromReaderBook(selectedProfile, book).booksId)
              return (
                <article key={book.id} className="readerBookCard">
                  <BookCover book={book} />
                  <h3>{book.title}</h3>
                  <div className="readerBookMeta">
                    <p className="readerBookAuthor">{book.author}</p>
                    {book.rating && (
                      <p className="readerBookRating">
                        별점 {book.rating.toFixed(1)}
                        {book.reviewCount ? ` (${book.reviewCount})` : ''}
                      </p>
                    )}
                  </div>
                  <strong>추천 이유</strong>
                  <p>{book.reason}</p>
                  <AppButton
                    variant={isAdded ? 'danger' : 'secondary'}
                    size="sm"
                    className="readerBookAddButton"
                    data-added={isAdded}
                    fullWidth
                    onClick={() => handleBookPlanClick(book)}
                  >
                    {isAdded ? '담기 취소' : '책 담기'}
                  </AppButton>
                </article>
              )
            })}
          </div>
        </article>
      </div>

      <div className="similarReadersStartDock">
        <AppButton
          variant="primary"
          className="similarReadersStartTrigger"
          data-ready={canStartWithPlannedBooks || undefined}
          disabled={!canStartWithPlannedBooks}
          title={canStartWithPlannedBooks ? undefined : '마음에 드는 책을 먼저 담아주세요'}
          onClick={onStart}
        >
          담은 책으로 시작하기
          {canStartWithPlannedBooks && (
            <span className="similarReadersStartCount">{plannedBooks.length}권</span>
          )}
        </AppButton>
      </div>
    </section>
  )
}

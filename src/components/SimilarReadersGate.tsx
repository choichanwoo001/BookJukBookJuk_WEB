import { useMemo, useState } from 'react'
import { defaultTasteSeed, rankReaderProfiles } from '../data/readerProfiles'
import type { ReaderBook, ReaderProfile, TasteSeed } from '../types/onboarding'

type SimilarReadersGateProps = {
  tasteSeed: TasteSeed | null
  usersId: string | null
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

export default function SimilarReadersGate({ tasteSeed, usersId, onStart }: SimilarReadersGateProps) {
  const rankedProfiles = useMemo(() => rankReaderProfiles(tasteSeed ?? defaultTasteSeed), [tasteSeed])
  const [selectedId, setSelectedId] = useState(rankedProfiles[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<BookTab>('liked')
  const selectedProfile = rankedProfiles.find((profile) => profile.id === selectedId) ?? rankedProfiles[0]
  const activeBooks = activeTab === 'liked' ? selectedProfile.likedBooks : selectedProfile.readBooks

  return (
    <section className="similarReadersPage" aria-label="비슷한 독자 추천">
      <header className="similarReadersHeader">
        <div>
          <p className="onboardingEyebrow">Taste match</p>
          <h1>나와 비슷하게 읽은 사람들</h1>
          <p>내 독서 기록과 비슷한 취향을 가진 독자들이에요.</p>
        </div>
        <div className="similarReadersControls">
          <span>{usersId ? `연결된 사용자 ${usersId}` : `${tasteSeed?.tone ?? defaultTasteSeed.tone} 취향 분석`}</span>
          <button type="button" onClick={onStart}>
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
                    {profile.reasons.slice(0, 2).map((reason) => (
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
            {activeBooks.map((book) => (
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
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

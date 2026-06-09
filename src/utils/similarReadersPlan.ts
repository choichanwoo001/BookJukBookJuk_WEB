import type { ShoppingListEntry } from '../agent/types'
import { demoBookToEntry, findDemoBookByTitle } from '../data/demoScenario'
import type { ReaderBook, ReaderProfile } from '../types/onboarding'

export function planEntryFromReaderBook(profile: ReaderProfile, book: ReaderBook): ShoppingListEntry {
  const demoDef = findDemoBookByTitle(book.title)
  if (demoDef) {
    return demoBookToEntry(demoDef, demoDef.fallbackBooksId, book.coverUrl)
  }
  return {
    booksId: `reader-${profile.id}-${book.id}`,
    title: book.title,
    authors: book.author,
    coverImageUrl: book.coverUrl ?? '',
  }
}

export function partitionReaderBookEntries(
  profile: ReaderProfile,
  books: ReaderBook[],
  plannedBookIds: Set<string>,
): { toAdd: ShoppingListEntry[]; toRemove: ShoppingListEntry[] } {
  const toAdd: ShoppingListEntry[] = []
  const toRemove: ShoppingListEntry[] = []
  for (const book of books) {
    const entry = planEntryFromReaderBook(profile, book)
    if (plannedBookIds.has(entry.booksId)) toRemove.push(entry)
    else toAdd.push(entry)
  }
  return { toAdd, toRemove }
}

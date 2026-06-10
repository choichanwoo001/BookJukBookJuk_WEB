import { useCallback, useEffect, useRef } from 'react'
import { offsetDuplicateBookshelf, parseBookshelfFromClipboardText } from '../utils/bookshelfClipboard'
import { isEditableDomTarget } from '../utils/domTarget'
import type { FixtureRenderInstance } from '../types/scene'

export type BookshelfClipboardOptions = {
  instances: FixtureRenderInstance[]
  selectedIndex: number | null
  initialInstances: FixtureRenderInstance[]
  isEnabled: boolean
  onPasteNew: (template: FixtureRenderInstance) => void
}

export function useBookshelfClipboard({
  instances,
  selectedIndex,
  initialInstances,
  isEnabled,
  onPasteNew,
}: BookshelfClipboardOptions) {
  const copiedBookshelfRef = useRef<FixtureRenderInstance | null>(null)

  const copySelectedToClipboard = useCallback(() => {
    if (selectedIndex === null) return
    const inst = instances[selectedIndex]
    if (!inst) return
    const snapshot: FixtureRenderInstance = { ...inst, kind: 'bookshelf' }
    copiedBookshelfRef.current = snapshot
    navigator.clipboard.writeText(JSON.stringify(snapshot)).catch(() => {})
  }, [selectedIndex, instances])

  const handlePaste = useCallback(async () => {
    let template: FixtureRenderInstance | null = null
    try {
      const text = await navigator.clipboard.readText()
      template = parseBookshelfFromClipboardText(text)
    } catch {
      /* clipboard API unavailable or denied */
    }
    if (!template) template = copiedBookshelfRef.current
    if (!template) return
    onPasteNew(offsetDuplicateBookshelf(template))
  }, [onPasteNew])

  const handleCopyAll = useCallback(() => {
    const json = JSON.stringify(
      instances.map(({ cx, cz, w, d, yaw, h }) => ({
        cx: +cx.toFixed(3),
        cz: +cz.toFixed(3),
        w: +w.toFixed(3),
        d: +d.toFixed(3),
        yaw: +yaw.toFixed(4),
        h: +h.toFixed(3),
      })),
      null,
      2,
    )
    navigator.clipboard.writeText(json).catch(() => {})
  }, [instances])

  const handleCopyChanged = useCallback(() => {
    const changed: { index: number; instance: FixtureRenderInstance }[] = []
    for (let i = 0; i < instances.length; i++) {
      const cur = instances[i]
      const orig = initialInstances[i]
      if (
        !orig
        || cur.cx !== orig.cx
        || cur.cz !== orig.cz
        || cur.yaw !== orig.yaw
        || cur.w !== orig.w
        || cur.d !== orig.d
        || cur.h !== orig.h
      ) {
        changed.push({ index: i, instance: cur })
      }
    }
    const json = JSON.stringify(
      changed.map(({ index, instance: { cx, cz, w, d, yaw, h } }) => ({
        index,
        cx: +cx.toFixed(3),
        cz: +cz.toFixed(3),
        w: +w.toFixed(3),
        d: +d.toFixed(3),
        yaw: +yaw.toFixed(4),
        h: +h.toFixed(3),
      })),
      null,
      2,
    )
    navigator.clipboard.writeText(json).catch(() => {})
  }, [instances, initialInstances])

  useEffect(() => {
    if (!isEnabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (isEditableDomTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        if (selectedIndex === null) return
        e.preventDefault()
        copySelectedToClipboard()
        return
      }
      if (k === 'v') {
        e.preventDefault()
        void handlePaste()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEnabled, selectedIndex, copySelectedToClipboard, handlePaste])

  return {
    copySelectedToClipboard,
    handlePaste,
    handleCopyAll,
    handleCopyChanged,
  }
}

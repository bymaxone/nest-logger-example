/**
 * @fileoverview useFollowMode — `less +F` follow behaviour for the live tail.
 *
 * When pinned to the bottom, new rows auto-scroll into view; scrolling up pauses
 * auto-scroll and accumulates a "N new" count; `jumpToLatest()` returns to the
 * bottom and resumes (`DASHBOARD.md` §7).
 *
 * @module hooks/use-follow-mode
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Distance (px) from the bottom still considered "pinned". */
const PINNED_THRESHOLD = 48

/** Follow-mode state and controls. */
export interface FollowMode {
  /** Whether auto-scroll is paused (scrolled up or explicitly paused). */
  paused: boolean
  /** Count of rows that arrived while paused. */
  newCount: number
  /** Scroll to the bottom and resume following. */
  jumpToLatest: () => void
  /** Explicitly pause auto-scroll. */
  pause: () => void
  /** Resume auto-scroll and jump to the bottom. */
  resume: () => void
}

/**
 * Drive follow-mode for a scroll container as its row count grows.
 *
 * @param scrollRef - Ref to the scrollable table container.
 * @param count - Total row count (re-evaluated when new rows arrive).
 * @returns Follow-mode state and controls.
 */
export function useFollowMode(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  count: number,
): FollowMode {
  const [pinned, setPinned] = useState(true)
  const [explicitPause, setExplicitPause] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const prevCount = useRef(count)

  const paused = explicitPause || !pinned

  // Track whether the container is pinned to the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const onScroll = (): void => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_THRESHOLD
      setPinned(isAtBottom)
      if (isAtBottom) setNewCount(0)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  // Auto-scroll on new rows when following; otherwise accumulate the new count.
  useEffect(() => {
    const delta = count - prevCount.current
    prevCount.current = count
    if (delta <= 0) return
    const el = scrollRef.current
    if (!paused && el !== null) {
      el.scrollTop = el.scrollHeight
    } else {
      setNewCount((n) => n + delta)
    }
  }, [count, paused, scrollRef])

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
    setExplicitPause(false)
    setNewCount(0)
  }, [scrollRef])

  const pause = useCallback(() => setExplicitPause(true), [])
  const resume = useCallback(() => {
    setExplicitPause(false)
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
    setNewCount(0)
  }, [scrollRef])

  return { paused, newCount, jumpToLatest, pause, resume }
}

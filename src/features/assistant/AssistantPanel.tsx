import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  useChatMessages, useChatQuota, useChatThreads, useCreateThread, useSendMessage,
} from './queries'
import type { ChatMessage } from '@/lib/types'
import { isPreview } from '@/data'
import { cn } from '@/lib/cn'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** Questions worth one tap, because a blank box is the hardest thing to start. */
const OPENERS = [
  'What is due this week?',
  'What is on tomorrow?',
  'Summarise my most recent notes.',
  'How am I doing in my classes?',
]

/**
 * The assistant, as a panel rather than a page.
 *
 * A page would mean leaving whatever you were looking at to ask about it, and
 * the questions worth asking here are nearly always about the screen you are
 * on. It opens over the app, keeps its thread, and closes back to where you
 * were.
 *
 * It is a dialog in the full sense -- focus moves in, is trapped, and returns
 * to the launcher on close -- because the sidebar's own drawer was not, and
 * that turned out to matter.
 */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)

  const { data: threads = [] } = useChatThreads()
  const createThread = useCreateThread()
  const send = useSendMessage()
  const { data: quota } = useChatQuota()

  const [threadId, setThreadId] = useState<string | null>(null)
  const { data: messages = [] } = useChatMessages(threadId)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Continue the most recent conversation rather than starting a fresh one
  // every time the panel opens. Somebody who asked something a minute ago and
  // reopened this almost certainly meant to carry on.
  useEffect(() => {
    if (open && !threadId && threads.length > 0) setThreadId(threads[0]!.id)
  }, [open, threadId, threads])

  useEffect(() => {
    if (!open) return
    returnFocusTo.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => inputRef.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      // Trapped, the same way Dialog does it: without this, Tab walks out of
      // an open panel into the page behind, which is still there and still
      // clickable but is not what anybody is looking at.
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      returnFocusTo.current?.focus?.()
    }
  }, [open, onClose])

  // Follow the conversation down as it grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
  }, [messages.length, reduce])

  async function submit(question: string) {
    const asked = question.trim()
    if (!asked || send.isPending) return
    setError(null)
    setText('')
    try {
      let id = threadId
      if (!id) {
        const thread = await createThread.mutateAsync(asked.slice(0, 60))
        id = thread.id
        setThreadId(id)
      }
      await send.mutateAsync({ threadId: id, text: asked })
    } catch (err) {
      // Put back what they typed. Losing a question to a failure is the
      // fastest way to make somebody stop asking.
      setText(asked)
      setError(err instanceof Error ? err.message : 'That did not go through.')
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'var(--overlay)' }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Assistant"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-surface"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden />
              <h2 className="flex-1 text-[14px] font-medium text-text">Assistant</h2>
              {quota && (
                <span className="text-[11.5px] tabular-nums text-text-subtle">
                  {Math.max(quota.limit - quota.used, 0)} left today
                </span>
              )}
              <button
                onClick={onClose}
                aria-label="Close the assistant"
                className="grid h-8 w-8 place-items-center rounded-md text-text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {isPreview && (
                // Said before the first question rather than after it. The
                // preview answers out of sample data with no model involved,
                // and letting somebody believe otherwise is the one thing this
                // project's rules forbid outright.
                <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-muted">
                  This is the preview. Answers are read straight out of the sample
                  data — no model is asked anything.
                </p>
              )}

              {messages.length === 0 ? (
                <div className="pt-2">
                  <p className="text-[13.5px] text-text-muted">
                    Ask about your timetable, what is due, or what is in your notes.
                    It can only read — it never changes anything.
                  </p>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {OPENERS.map((q) => (
                      <button
                        key={q}
                        onClick={() => void submit(q)}
                        className="rounded-lg border border-border px-3 py-2 text-left text-[13px] text-text-muted transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 hover:text-text"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {messages.map((m) => <Bubble key={m.id} message={m} />)}
                </ul>
              )}

              {send.isPending && (
                <p aria-live="polite" className="mt-3 text-[13px] text-text-subtle">
                  Reading your calendar…
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-[12.5px] text-danger">
                  {error}
                </p>
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); void submit(text) }}
              className="border-t border-border p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line. A textarea
                    // rather than an input because questions here run to two
                    // lines and an input hides everything past the first.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void submit(text)
                    }
                  }}
                  rows={1}
                  placeholder="Ask about your week…"
                  aria-label="Ask the assistant"
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors duration-150 placeholder:text-text-subtle hover:border-border-strong focus:outline-none"
                />
                <Button
                  type="submit"
                  size="md"
                  aria-label="Send"
                  disabled={!text.trim()}
                  loading={send.isPending}
                  className="h-10 w-10 shrink-0 p-0"
                >
                  {!send.isPending && <ArrowUp className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed',
        mine ? 'bg-brand text-brand-contrast' : 'border border-border bg-surface-2 text-text',
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* What it read, under what it said. An assistant that cannot show its
            sources is one whose answers cannot be checked, and checkable is the
            whole argument this app makes about itself. */}
        {!mine && message.sources.length > 0 && (
          <p className="mt-2 border-t border-border pt-1.5 text-[11.5px] text-text-subtle">
            From: {message.sources.map((s) => s.title).join(', ')}
          </p>
        )}
      </div>
    </li>
  )
}

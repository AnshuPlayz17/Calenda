import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Code, Heading2, Heading3, Italic, List, ListOrdered, ListTodo, Quote, Strikethrough,
} from 'lucide-react'
import { useUpdatePage } from '@/features/classes/queries'
import type { NotebookPage } from '@/lib/types'
import { cn } from '@/lib/cn'

/** Milliseconds of quiet before a save. Long enough not to save mid-word. */
const AUTOSAVE_DELAY = 900

export function NoteEditor({ page }: { page: NotebookPage }) {
  const save = useUpdatePage()
  const [title, setTitle] = useState(page.title)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: (page.content as object) ?? '',
    editorProps: {
      attributes: {
        class: 'calenda-prose focus:outline-none min-h-[45vh]',
      },
    },
    onUpdate: ({ editor }) => queueSave(editor),
  }, [page.id])

  // Swapping pages must not carry the previous page's draft across.
  useEffect(() => {
    setTitle(page.title)
    setStatus('idle')
  }, [page.id, page.title])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function queueSave(ed: Editor, nextTitle?: string) {
    if (timer.current) clearTimeout(timer.current)
    setStatus('saving')
    timer.current = setTimeout(async () => {
      try {
        await save.mutateAsync({
          id: page.id,
          patch: {
            content: ed.getJSON(),
            // Plain text alongside the document, so search never has to parse
            // the editor's JSON.
            contentText: ed.getText(),
            ...(nextTitle !== undefined ? { title: nextTitle } : {}),
          },
        })
        setStatus('saved')
      } catch {
        setStatus('idle')
      }
    }, AUTOSAVE_DELAY)
  }

  function onTitleChange(value: string) {
    setTitle(value)
    if (editor) queueSave(editor, value.trim() || 'Untitled')
  }

  if (!editor) {
    return <div className="px-1 py-6 text-[13px] text-text-subtle">Loading editor…</div>
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Page title"
          placeholder="Untitled"
          className="min-w-0 flex-1 bg-transparent font-display text-[26px] font-medium tracking-tight text-text placeholder:text-text-subtle focus:outline-none"
        />
        <span
          aria-live="polite"
          className="mt-2 shrink-0 label-caps"
        >
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <Toolbar editor={editor} />

      <EditorContent editor={editor} className="mt-3" />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const items = [
    { label: 'Bold', Icon: Bold, run: () => editor.chain().focus().toggleBold().run(), active: 'bold' },
    { label: 'Italic', Icon: Italic, run: () => editor.chain().focus().toggleItalic().run(), active: 'italic' },
    { label: 'Strikethrough', Icon: Strikethrough, run: () => editor.chain().focus().toggleStrike().run(), active: 'strike' },
    { label: 'Heading', Icon: Heading2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: 'heading', attrs: { level: 2 } },
    { label: 'Subheading', Icon: Heading3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: 'heading', attrs: { level: 3 } },
    { label: 'Bullet list', Icon: List, run: () => editor.chain().focus().toggleBulletList().run(), active: 'bulletList' },
    { label: 'Numbered list', Icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run(), active: 'orderedList' },
    { label: 'Checklist', Icon: ListTodo, run: () => editor.chain().focus().toggleTaskList().run(), active: 'taskList' },
    { label: 'Quote', Icon: Quote, run: () => editor.chain().focus().toggleBlockquote().run(), active: 'blockquote' },
    { label: 'Code block', Icon: Code, run: () => editor.chain().focus().toggleCodeBlock().run(), active: 'codeBlock' },
  ] as const

  return (
    <div // The toolbar sits inside a card, so it must match the CARD's surface --
      // using the page background paints a grey band across the white card.
      className="sticky top-0 z-10 -mx-1 mt-3 flex flex-wrap gap-0.5 border-b border-border bg-surface/95 px-1 pb-2 backdrop-blur">
      {items.map(({ label, Icon, run, active, ...rest }) => {
        const attrs = 'attrs' in rest ? (rest as { attrs: Record<string, unknown> }).attrs : undefined
        const isOn = attrs ? editor.isActive(active, attrs) : editor.isActive(active)
        return (
          <button
            key={label}
            type="button"
            onClick={run}
            aria-label={label}
            aria-pressed={isOn}
            title={label}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-md transition-colors duration-150',
              isOn ? 'bg-brand-subtle text-brand' : 'text-text-subtle hover:bg-surface-2 hover:text-text',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

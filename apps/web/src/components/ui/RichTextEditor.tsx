import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline
} from 'lucide-react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

type ToolbarItem =
  | { command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'insertUnorderedList' | 'insertOrderedList'; icon: any; label: string }
  | { command: 'formatBlock'; value: string; label: string }
  | { command: 'createLink'; icon: any; label: string }

export function RichTextEditor({
  isDark,
  label,
  minHeight,
  maxHeight,
  onChange,
  placeholder,
  value,
}: {
  isDark: boolean
  label: string
  minHeight: number
  maxHeight?: number
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editorRef.current || editorRef.current.innerHTML === value) {
      return
    }

    editorRef.current.innerHTML = value
  }, [value])

  function focusEditor() {
    editorRef.current?.focus()
  }

  function applyCommand(command: string, commandValue?: string) {
    if (!editorRef.current) {
      return
    }

    focusEditor()
    document.execCommand(command, false, commandValue)
    onChange(editorRef.current.innerHTML)
  }

  function insertLink() {
    if (typeof window === 'undefined') {
      return
    }

    const url = window.prompt('Enter the link URL')
    if (!url) {
      return
    }

    applyCommand('createLink', url)
  }

  const toolbar: ToolbarItem[] = [
    { command: 'bold', icon: Bold, label: 'Bold' },
    { command: 'italic', icon: Italic, label: 'Italic' },
    { command: 'underline', icon: Underline, label: 'Underline' },
    { command: 'strikeThrough', icon: Strikethrough, label: 'Strikethrough' },
    { command: 'formatBlock', value: '<h2>', label: 'H2' },
    { command: 'formatBlock', value: '<h3>', label: 'H3' },
    { command: 'justifyLeft', icon: AlignLeft, label: 'Align left' },
    { command: 'justifyCenter', icon: AlignCenter, label: 'Align center' },
    { command: 'justifyRight', icon: AlignRight, label: 'Align right' },
    { command: 'insertUnorderedList', icon: List, label: 'Bullet list' },
    { command: 'insertOrderedList', icon: ListOrdered, label: 'Numbered list' },
    { command: 'createLink', icon: Link2, label: 'Insert link' },
  ]

  const isEmpty =
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim().length === 0

  return (
    <div className="space-y-2">
      <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
        {label}
      </span>
      <div className={cn('rounded-[24px] border', isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
        <div className={cn('flex flex-wrap gap-2 border-b px-3 py-2.5', isDark ? 'border-slate-700' : 'border-slate-200')}>
          {toolbar.map((item) => {
            if (item.command === 'formatBlock') {
              return (
                <button
                  className={cn(
                    'inline-flex h-9 items-center justify-center rounded-2xl border px-3 text-xs font-semibold transition',
                    isDark
                      ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950',
                  )}
                  key={`${item.command}-${item.value}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    applyCommand(item.command, item.value)
                  }}
                  title={item.label}
                  type="button"
                >
                  {item.label}
                </button>
              )
            }

            const Icon = item.icon
            return (
              <button
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition',
                  isDark
                    ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950',
                )}
                key={`${item.command}-${item.label}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (item.command === 'createLink') {
                    insertLink()
                    return
                  }
                  applyCommand(item.command)
                }}
                title={item.label}
                type="button"
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>

        <div
          className={cn('relative cursor-text overflow-y-auto', maxHeight ? 'max-h-[var(--editor-max-height)]' : undefined)}
          onClick={focusEditor}
          style={
            maxHeight
              ? ({
                  minHeight,
                  ['--editor-max-height' as any]: `${maxHeight}px`,
                } as any)
              : { minHeight }
          }
        >
          {isEmpty ? (
            <div className={cn('pointer-events-none absolute left-4 top-4 text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {placeholder}
            </div>
          ) : null}
          <div
            aria-label={label}
            className={cn('prose prose-sm max-w-none px-4 py-3 leading-7 outline-none', isDark ? 'prose-invert text-slate-200' : 'text-slate-900')}
            contentEditable
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            ref={editorRef}
            suppressContentEditableWarning
            tabIndex={0}
          />
        </div>
      </div>
    </div>
  )
}

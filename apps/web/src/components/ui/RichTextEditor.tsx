import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  Underline
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type ToolbarItem =
  | { command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'insertUnorderedList' | 'insertOrderedList'; icon: any; label: string }
  | { command: 'foreColor'; icon: any; label: string }
  | { command: 'formatBlock'; value: string; label: string }
  | { command: 'createLink'; icon: any; label: string }

export function RichTextEditor({
  isDark = false,
  label,
  minHeight,
  maxHeight,
  onChange,
  placeholder,
  readOnly = false,
  value,
}: {
  isDark?: boolean
  label?: string
  minHeight: number
  maxHeight?: number
  onChange: (value: string) => void
  placeholder: string
  readOnly?: boolean
  value: string
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const selectionRef = useRef<Range | null>(null)
  // Guards the useEffect sync from overwriting user's mid-keystroke DOM with a stale value prop.
  const lastAppliedValueRef = useRef<string>('')
  const [, forceMount] = useState(0)

  useEffect(() => {
    const node = editorRef.current
    if (!node) {
      return
    }

    // Only overwrite DOM when value actually differs from both current innerHTML and
    // the last value we programmatically wrote. This prevents a sync loop:
    // user types → onChange → parent updates value → useEffect matches lastAppliedValueRef → no-op.
    const normalizedIncoming = value ?? ''
    if (node.innerHTML === normalizedIncoming || lastAppliedValueRef.current === normalizedIncoming) {
      return
    }

    // Preserve caret position on external sync (e.g., modal re-opened with previous draft).
    let offset = 0
    let wasFocused = false
    if (document.activeElement === node) {
      wasFocused = true
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && node.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0)
        const preRange = document.createRange()
        preRange.selectNodeContents(node)
        preRange.setEnd(range.endContainer, range.endOffset)
        offset = preRange.toString().length
      }
    }

    node.innerHTML = normalizedIncoming
    lastAppliedValueRef.current = normalizedIncoming

    if (wasFocused) {
      focusEditor()
      restoreTextOffset(node, offset)
    }
    // Force re-evaluation of the placeholder computed from `value` when syncing externally.
    forceMount((n) => n + 1)
  }, [value])

  function focusEditor() {
    const node = editorRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    // If empty, ensure the caret sits inside a paragraph so typed text inherits prose styles.
    if (!node.textContent && node.innerHTML.replace(/<br\s*\/?>/gi, '').trim() === '') {
      node.innerHTML = ''
      const p = document.createElement('p')
      const br = document.createElement('br')
      p.appendChild(br)
      node.appendChild(p)
      const range = document.createRange()
      range.selectNodeContents(p)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  function restoreTextOffset(node: HTMLElement, offset: number) {
    const sel = window.getSelection()
    if (!sel) return
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let current: Node | null
    let remaining = offset
    let target: Node | null = null
    let targetOffset = 0
    while ((current = walker.nextNode())) {
      const text = (current as Text).data ?? ''
      if (remaining <= text.length) {
        target = current
        targetOffset = remaining
        break
      }
      remaining -= text.length
    }
    const range = document.createRange()
    if (target) {
      range.setStart(target, targetOffset)
    } else {
      range.selectNodeContents(node)
      range.collapse(false)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function saveSelection() {
    if (typeof window === 'undefined') {
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      return
    }

    selectionRef.current = range.cloneRange()
  }

  function restoreSelection() {
    if (typeof window === 'undefined') {
      return
    }

    const range = selectionRef.current
    if (!range) {
      return
    }

    const selection = window.getSelection()
    if (!selection) {
      return
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }

  function applyCommand(command: string, commandValue?: string) {
    if (!editorRef.current) {
      return
    }

    // Before any toolbar command, capture selection (toolbar buttons will steal focus on click).
    saveSelection()
    focusEditor()
    // Only restore if the previously saved selection is still valid within the editor.
    const currentSel = window.getSelection()
    if (currentSel && currentSel.rangeCount > 0 && editorRef.current?.contains(currentSel.anchorNode)) {
      // User already has focus inside editor — no stale restore.
    } else {
      restoreSelection()
    }
    document.execCommand(command, false, commandValue)
    // Wrap edited HTML in a paragraph if needed to keep prose styles.
    if (editorRef.current && editorRef.current.innerHTML.trim() === '') {
      editorRef.current.innerHTML = '<p><br></p>'
    }
    onChange(editorRef.current.innerHTML)
    lastAppliedValueRef.current = editorRef.current.innerHTML
  }

  function insertLink() {
    if (typeof window === 'undefined') {
      return
    }

    saveSelection()
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
    { command: 'foreColor', icon: Highlighter, label: 'Text color' },
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
      {label ? (
        <span className={cn('text-xs font-medium uppercase tracking-[0.18em]', isDark ? 'text-slate-500' : 'text-slate-500')}>
          {label}
        </span>
      ) : null}
      <div className={cn('rounded-[24px] border', isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50')}>
        {!readOnly ? (
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
                    disabled={readOnly}
                    key={`${item.command}-${item.value}`}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      if (!readOnly) applyCommand(item.command, item.value)
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
                    'inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition disabled:cursor-not-allowed disabled:opacity-50',
                    isDark
                      ? 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-600 hover:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950',
                  )}
                  disabled={readOnly}
                  key={`${item.command}-${item.label}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    if (readOnly) return
                    if (item.command === 'foreColor') {
                      saveSelection()
                      colorInputRef.current?.click()
                      return
                    }
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
            <input
              className="sr-only"
              disabled={readOnly}
              onChange={(event) => applyCommand('foreColor', event.target.value)}
              ref={colorInputRef}
              type="color"
            />
          </div>
        ) : null}

        <div
          className={cn('relative overflow-y-auto', maxHeight ? 'max-h-[var(--editor-max-height)]' : undefined, readOnly ? 'cursor-default' : 'cursor-text')}
          onClick={readOnly ? undefined : focusEditor}
          onMouseDown={(event) => {
            // Clicking inside the editor scroll container but outside the contentEditable (e.g.
            // dead space next to prose box) should still focus into contentEditable. Prevent the
            // wrapper div from swallowing the native selection placement.
            if (readOnly) return
            if (event.target === event.currentTarget || !editorRef.current?.contains(event.target as Node)) {
              event.preventDefault()
              focusEditor()
            }
          }}
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
            <div className={cn('pointer-events-none absolute left-4 top-4 text-sm select-none', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {placeholder}
            </div>
          ) : null}
          <div
            aria-label={label}
            className={cn(
              'rich-text-content prose prose-sm max-w-none px-4 py-3 leading-7 outline-none min-h-[inherit]',
              isDark ? 'prose-invert text-slate-200' : 'text-slate-900',
              readOnly ? 'pointer-events-none select-text' : '',
            )}
            contentEditable={!readOnly}
            onBlur={() => {
              // Save latest selection when focus leaves (toolbar clicks will rely on this)
              if (!readOnly) saveSelection()
            }}
            onInput={
              readOnly
                ? undefined
                : (event) => {
                    const nextHtml = event.currentTarget.innerHTML
                    lastAppliedValueRef.current = nextHtml
                    onChange(nextHtml)
                  }
            }
            onKeyUp={readOnly ? undefined : saveSelection}
            onMouseUp={readOnly ? undefined : saveSelection}
            ref={editorRef}
            spellCheck
            suppressContentEditableWarning
            tabIndex={readOnly ? -1 : 0}
          />
        </div>
      </div>
    </div>
  )
}

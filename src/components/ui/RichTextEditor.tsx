/**
 * Shared Tiptap-based rich text editor.
 * Replaces raw contentEditable across descriptions and comments.
 */

import { useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { Node, mergeAttributes } from '@tiptap/core'
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  Link as LinkIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { toTiptapDoc, fromTiptapDoc } from '@/lib/tiptap-serializer'
import { createMentionSuggestion } from '@/components/ui/MentionSuggestion'
import { parseAttachmentDrop } from '@/lib/rich-editor'
import { isImageType } from '@/lib/file-utils'
import type { ProjectMemberWithProfile } from '@/types/database'
import type { JSONContent } from '@tiptap/core'
import { Plugin as PmPlugin, PluginKey } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'

// ─── Custom FileLink node ──────────────────────────────────────────

const FileLink = Node.create({
  name: 'fileLink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      fileName: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-file-link-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-link-id': HTMLAttributes.id,
        'data-file-name': HTMLAttributes.fileName,
        contenteditable: 'false',
        class:
          'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary cursor-default',
      }),
      `📎 ${HTMLAttributes.fileName}`,
    ]
  },
})

// ─── Custom Image extension with data-inline-id ────────────────────

const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-inline-id': { default: null },
    }
  },
})

// ─── Strip pasted indentation ──────────────────────────────────────

const StripIndent = Extension.create({
  name: 'stripIndent',

  addProseMirrorPlugins() {
    return [
      new PmPlugin({
        key: new PluginKey('stripIndent'),
        props: {
          transformPastedText(text: string) {
            const lines = text.split('\n')
            const minIndent = lines
              .filter((l) => l.trim().length > 0)
              .reduce((min, line) => {
                const match = line.match(/^(\s*)/)
                return Math.min(min, match ? match[1]!.length : 0)
              }, Infinity)
            if (minIndent > 0 && minIndent < Infinity) {
              return lines.map((l) => l.slice(minIndent)).join('\n')
            }
            return text
          },
        },
      }),
    ]
  },
})

// ─── Props ─────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Raw body in our storage format */
  content: string
  /** Called with serialized raw body on every change */
  onChange?: (raw: string) => void
  /** Called when editor loses focus */
  onBlur?: () => void
  /** Placeholder text for empty editor */
  placeholder?: string
  /** Whether editor is editable */
  editable?: boolean
  /** Additional class for the editor wrapper */
  className?: string
  /** Project members for @ mention */
  members?: ProjectMemberWithProfile[]
  /** Handle pasted image file. Return temp ID to insert inline, or null to skip. */
  onImagePaste?: (file: File) => string | null
  /** Handle drop of a same-entity attachment. Called with parsed drop data. */
  onAttachmentDrop?: (data: {
    id: string
    fileName: string
    fileType: string
    storagePath: string
  }) => void
  /** Staged files array for drag-to-inline insertion */
  stagedFiles?: File[]
  /** Handle staged file dropped into editor. Return temp ID, or null to skip. */
  onStagedFileDrop?: (file: File) => string | null
  /** Minimum height CSS value */
  minHeight?: string
  /** Ref to get the editor instance (for imperative clear, etc.) */
  editorRef?: React.MutableRefObject<ReturnType<typeof useEditor> | null>
  /** Ctrl+Enter handler */
  onSubmit?: () => void
  /** Existing attachments for resolving inline image URLs in edit mode */
  attachments?: { id: string; storage_path: string; file_type: string }[]
  /** Called when Escape pressed inside editor (cancel edit) */
  onEscape?: () => void
}

// ─── Component ─────────────────────────────────────────────────────

export function RichTextEditor({
  content,
  onChange,
  onBlur,
  placeholder: placeholderText = '',
  editable = true,
  className,
  members = [],
  onImagePaste,
  onAttachmentDrop,
  stagedFiles,
  onStagedFileDrop,
  minHeight = '5rem',
  editorRef,
  onSubmit,
  attachments,
  onEscape,
}: RichTextEditorProps) {
  const isInitialMount = useRef(true)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  const mentionSuggestion = useMemo(
    () => createMentionSuggestion(members),
    [members],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      CustomImage.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full max-h-48 rounded-lg border border-border my-1 block',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Placeholder.configure({
        placeholder: placeholderText,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'inline rounded bg-primary/20 px-0.5 text-primary font-medium',
        },
        renderText({ node }) {
          return `@${(node.attrs.label ?? '').split(/\s+/)[0]}`
        },
        suggestion: mentionSuggestion,
      }),
      FileLink,
      StripIndent,
    ],
    content: toTiptapDoc(content),
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none',
          '[&_p]:my-0.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0',
          '[&_.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.is-editor-empty:first-child::before]:float-left',
          '[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.is-editor-empty:first-child::before]:h-0',
        ),
      },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          onSubmitRef.current?.()
          return true
        }
        if (event.key === 'Escape' && onEscapeRef.current) {
          event.preventDefault()
          onEscapeRef.current()
          return true
        }
        return false
      },
      handlePaste(view, event) {
        const files = event.clipboardData?.files
        if (!files || files.length === 0) return false

        const imageFiles = Array.from(files).filter((f) => isImageType(f.type))
        if (imageFiles.length === 0) return false

        event.preventDefault()
        for (const file of imageFiles) {
          const tempId = onImagePaste?.(file)
          if (tempId) {
            const src = URL.createObjectURL(file)
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image!.create({
                  src,
                  'data-inline-id': tempId,
                }),
              ),
            )
          }
        }
        return true
      },
      handleDrop(view, event) {
        const dragEvent = event as DragEvent

        // Handle staged file chip drop
        const stagedIndex = dragEvent.dataTransfer?.getData('application/staged-file-index')
        if (stagedIndex !== undefined && stagedIndex !== '') {
          const idx = parseInt(stagedIndex, 10)
          const file = stagedFiles?.[idx]
          if (!file) return false
          event.preventDefault()

          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const insertPos = pos?.pos ?? view.state.selection.from
          const tempId = onStagedFileDrop?.(file)
          if (!tempId) return true

          if (isImageType(file.type)) {
            const src = URL.createObjectURL(file)
            const node = view.state.schema.nodes.image!.create({
              src,
              'data-inline-id': tempId,
            })
            view.dispatch(view.state.tr.insert(insertPos, node))
          } else {
            const node = view.state.schema.nodes.fileLink!.create({
              id: tempId,
              fileName: file.name,
            })
            view.dispatch(view.state.tr.insert(insertPos, node))
          }
          return true
        }

        // Handle same-entity attachment drop
        const attData = parseAttachmentDrop(dragEvent)
        if (attData) {
          event.preventDefault()
          // Insert image or file link node
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          const insertPos = pos?.pos ?? view.state.selection.from

          if (isImageType(attData.fileType)) {
            onAttachmentDrop?.(attData)
            // Image will be inserted once signed URL is obtained by caller
            // For now insert with empty src, caller replaces
            const node = view.state.schema.nodes.image!.create({
              src: '',
              'data-inline-id': attData.id,
            })
            view.dispatch(view.state.tr.insert(insertPos, node))
          } else {
            onAttachmentDrop?.(attData)
            const node = view.state.schema.nodes.fileLink!.create({
              id: attData.id,
              fileName: attData.fileName,
            })
            view.dispatch(view.state.tr.insert(insertPos, node))
          }
          return true
        }

        return false
      },
    },
    onUpdate({ editor: ed }) {
      const raw = fromTiptapDoc(ed.getJSON() as JSONContent)
      onChangeRef.current?.(raw)
    },
    onBlur() {
      onBlur?.()
    },
  })

  // Expose editor ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor
    }
  }, [editor, editorRef])

  // Update editable state
  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  // Resolve inline image URLs from attachments (for edit mode)
  useEffect(() => {
    if (!editor || !attachments?.length) return
    const { doc } = editor.state
    const updates: { pos: number; id: string }[] = []
    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && !node.attrs.src && node.attrs['data-inline-id']) {
        updates.push({ pos, id: node.attrs['data-inline-id'] })
      }
    })
    if (updates.length === 0) return

    let cancelled = false
    Promise.all(
      updates.map(async ({ pos, id }) => {
        const att = attachments.find((a) => a.id === id)
        if (!att) return null
        const { data } = await supabase.storage
          .from('attachments')
          .createSignedUrl(att.storage_path, 3600)
        return data?.signedUrl ? { pos, url: data.signedUrl, id } : null
      })
    ).then((results) => {
      if (cancelled || !editor) return
      const valid = results.filter(Boolean) as { pos: number; url: string; id: string }[]
      if (valid.length === 0) return
      // Re-scan positions since doc may have changed
      const { tr } = editor.state
      let modified = false
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && !node.attrs.src && node.attrs['data-inline-id']) {
          const match = valid.find((v) => v.id === node.attrs['data-inline-id'])
          if (match) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: match.url })
            modified = true
          }
        }
      })
      if (modified) editor.view.dispatch(tr)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, attachments])

  // Update content when prop changes (not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!editor) return
    const currentRaw = fromTiptapDoc(editor.getJSON() as JSONContent)
    if (currentRaw !== content) {
      editor.commands.setContent(toTiptapDoc(content))
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-input bg-background ring-offset-background',
        'focus-within:ring-2 focus-within:ring-ring ring-inset',
        className,
      )}
    >
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1 h-4 w-px bg-border" />

          <ToolbarButton
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline Code"
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('link')}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
              } else {
                const href = window.prompt('URL:')
                if (href) {
                  editor.chain().focus().setLink({ href }).run()
                }
              }
            }}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <div
        style={{ minHeight }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            editor.commands.focus('end')
          }
        }}
      >
        <EditorContent
          editor={editor}
          className="px-3 py-2 text-sm text-foreground cursor-text [&_.ProseMirror]:outline-none"
        />
      </div>
    </div>
  )
}

// ─── Toolbar button ────────────────────────────────────────────────

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      className={cn(
        'rounded p-1.5 text-muted-foreground transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

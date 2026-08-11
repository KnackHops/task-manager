import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestContext } from '../auth.js'
import { resolveTaskId, formatTaskId } from '../helpers.js'

type ChecklistItem = { id: string; title: string; is_done: boolean; position: number }
type Attachment = { id: string; file_name: string; file_type: string; file_size: number }

function renderAttachments(list: Attachment[], lines: string[], indent = '') {
  for (const a of list) {
    const sizeKB = Math.round(a.file_size / 1024)
    lines.push(`${indent}- **${a.file_name}** (${a.file_type}, ${sizeKB}KB) — ID: \`${a.id}\``)
  }
}

/** Group attachments by the checklist item they belong to; null FK means "belongs to the parent". */
function groupByItem<T extends Attachment>(attachments: T[], fk: keyof T) {
  const byItem = new Map<string, T[]>()
  const flat: T[] = []
  for (const a of attachments) {
    const itemId = a[fk] as string | null
    if (itemId) {
      const bucket = byItem.get(itemId) ?? []
      bucket.push(a)
      byItem.set(itemId, bucket)
    } else {
      flat.push(a)
    }
  }
  return { byItem, flat }
}

function renderChecklist(
  items: ChecklistItem[],
  byItem: Map<string, Attachment[]>,
  lines: string[],
  heading: (done: number, total: number) => string
) {
  if (items.length === 0) return
  items.sort((a, b) => a.position - b.position)
  const done = items.filter((i) => i.is_done).length
  lines.push('')
  lines.push(heading(done, items.length))
  for (const item of items) {
    const check = item.is_done ? 'x' : ' '
    lines.push(`- [${check}] ${item.title} (id: \`${item.id}\`)`)
    renderAttachments(byItem.get(item.id) ?? [], lines, '  ')
  }
}

export function registerGetTask(server: McpServer, ctx: RequestContext) {
  server.tool(
    'get_task',
    `Get full details of a task by ID (e.g. "NT-1" or UUID). Returns description, route_path, column, tags, assignees, sprint, story points, checklists, recent comments (with their own checklists), and attachments (with IDs for use with get_attachment_url). Attachments and checklists can hang off the task or off an individual comment. Check route_path for the page/URL this task relates to. If the description is vague, use add_comment to ask the reporter for clarification before attempting to investigate or fix.`,
    {
      task_id: z.string().describe('Task ID in prefix-number format (e.g. "NT-1") or UUID'),
      comment_limit: z.number().default(10).describe('Number of recent comments to include (default: 10)'),
    },
    async (args) => {
      try {
        const taskUUID = await resolveTaskId(ctx.supabase, args.task_id)

        const { data: task, error } = await ctx.supabase
          .from('tasks')
          .select(`
            id, title, description, priority, task_number, story_points,
            route_path, route_label, archived, archived_at, created_at, updated_at,
            column:project_columns!column_id(id, name, slug),
            tags:task_tags(tag:project_tags(id, name, slug, color)),
            assignees:task_assignees(assignee:profiles(id, full_name, email)),
            sprint:sprints(id, name, status, start_date, end_date),
            creator:profiles!created_by(id, full_name, email),
            project:projects!project_id(id, name, slug, prefix),
            comments(count),
            task_memory(count),
            attachments(id, file_name, file_type, file_size, checklist_item_id),
            task_checklist_items(id, title, is_done, position)
          `)
          .eq('id', taskUUID)
          .single()

        if (error) {
          return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
        }

        const t = task as any
        const prefix = t.project?.prefix ?? ''
        const id = formatTaskId(prefix, t.task_number)

        // Fetch recent comments
        const { data: comments } = await ctx.supabase
          .from('comments')
          .select(`
            id, body, created_at, updated_at,
            author:profiles!author_id(full_name, email),
            comment_checklist_items(id, title, is_done, position),
            attachments(id, file_name, file_type, file_size, comment_checklist_item_id)
          `)
          .eq('task_id', taskUUID)
          .order('created_at', { ascending: false })
          .limit(args.comment_limit)

        // Build output
        const lines: string[] = []
        lines.push(`# ${id}: ${t.title}`)
        lines.push('')
        lines.push(`**Project:** ${t.project?.name} (${t.project?.slug})`)
        lines.push(`**Column:** ${t.column?.name ?? 'unknown'}`)
        lines.push(`**Priority:** ${t.priority}`)
        if (t.story_points) lines.push(`**Story Points:** ${t.story_points}`)
        if (t.sprint) {
          lines.push(`**Sprint:** ${t.sprint.name} [${t.sprint.status}] (${t.sprint.start_date} → ${t.sprint.end_date})`)
        }
        if (t.archived) lines.push(`**Archived:** ${t.archived_at}`)

        const assignees = t.assignees?.map((a: any) => a.assignee).filter(Boolean) ?? []
        if (assignees.length > 0) {
          lines.push(`**Assignees:** ${assignees.map((a: any) => `${a.full_name} (${a.email})`).join(', ')}`)
        }

        const tags = t.tags?.map((tt: any) => tt.tag).filter(Boolean) ?? []
        if (tags.length > 0) {
          lines.push(`**Tags:** ${tags.map((tag: any) => `#${tag.name}`).join(', ')}`)
        }

        if (t.route_path) lines.push(`**Route/URL:** ${t.route_path}`)

        if (t.creator) {
          lines.push(`**Created by:** ${t.creator.full_name} (${t.creator.email})`)
        }
        lines.push(`**Created:** ${t.created_at}`)
        lines.push(`**Updated:** ${t.updated_at}`)

        const commentCount = t.comments?.[0]?.count ?? 0
        const memoryCount = t.task_memory?.[0]?.count ?? 0
        const attachments = (t.attachments ?? []) as any[]
        lines.push(`**Comments:** ${commentCount} | **Attachments:** ${attachments.length} | **Memory:** ${memoryCount} facts`)
        if (memoryCount > 0) lines.push('_Call read_task_memory to load what Claude already knows about this task._')

        // Description
        lines.push('')
        lines.push('## Description')
        lines.push(t.description || '_No description provided._')

        // Checklist — item-scoped attachments render under their item, the rest stay in the flat list below
        const checklistItems = (t.task_checklist_items ?? []) as ChecklistItem[]
        const taskFiles = groupByItem(attachments, 'checklist_item_id')
        renderChecklist(checklistItems, taskFiles.byItem, lines, (done, total) => `## Checklist (${done}/${total})`)
        if (checklistItems.length > 0) {
          lines.push('')
          lines.push('_Use update_checklist_item with an item ID to toggle completion or edit title._')
        }

        // Attachments
        if (taskFiles.flat.length > 0) {
          lines.push('')
          lines.push('## Attachments')
          renderAttachments(taskFiles.flat, lines)
        }
        if (attachments.length > 0) {
          lines.push('')
          lines.push('_Use get_attachment_url with an attachment ID to get a download URL._')
        }

        // Comments
        if (comments && comments.length > 0) {
          lines.push('')
          lines.push(`## Recent Comments (last ${comments.length})`)
          for (const c of comments.reverse()) {
            const author = (c as any).author
            const edited = c.updated_at !== c.created_at ? ' (edited)' : ''
            lines.push(`\n**${author?.full_name ?? 'Unknown'}** — ${c.created_at}${edited}`)
            lines.push(c.body)

            const commentFiles = groupByItem(((c as any).attachments ?? []) as any[], 'comment_checklist_item_id')
            renderChecklist(
              ((c as any).comment_checklist_items ?? []) as ChecklistItem[],
              commentFiles.byItem,
              lines,
              (done, total) => `**Checklist (${done}/${total})**`
            )
            if (commentFiles.flat.length > 0) {
              lines.push('')
              lines.push('**Attachments**')
              renderAttachments(commentFiles.flat, lines)
            }
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true }
      }
    }
  )
}

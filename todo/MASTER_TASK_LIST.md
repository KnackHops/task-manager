# Task Manager — Master Task List

> Multi-project Kanban board. Supabase direct (no NestJS). Self-hosted on Coolify.
> Per-project custom columns, tags, permissions. Slugs for MCP agent ergonomics.

---

## Architecture Overview

- **Project = Board**: one Kanban board per project
- **Custom columns** per project with slugs (replaces hardcoded status enum)
- **Tags** per project with slugs + colors (replaces hardcoded type enum). Multiple tags per task (many-to-many)
- **Priority** stays fixed field: critical / high / medium / low
- **Permission-based auth**: project creator = owner. Owner invites members via email, grants granular permissions
- **Manual archive**: tasks get `archived` flag, viewable in archive page, unarchive to chosen column
- **MCP ergonomics**: slugs on projects + columns + tags for agent queries. Task IDs (prefix + number) for human-readable references.

### Data Model

```
projects (name, slug, prefix, default_column_id, created_by)
  ──< project_columns (custom columns per project)
  ──< project_tags (custom tags per project)
  ──< project_members (membership + permissions)
  ──< tasks (task_number, column_id, priority, archived, position)
        ──< task_tags (many-to-many → project_tags)
        ──< task_assignees (many-to-many → profiles)
        ──< comments (body, author_id, @mentions)
        ──< attachments

notifications (user_id, type, task_id, comment_id, actor_id, message, is_read, project_slug)
```

### Route Structure

```
/login                          — login page
/signup                         — signup page
/projects                       — project list (home after login)
/p/:slug                        — project board (kanban view)
/p/:slug/archive                — project archive view
/p/:slug/settings               — project settings (general, columns, tags, members)
```

### RLS Policy Model

All policies based on `project_members` table (not `profiles.role`):
- **SELECT**: user must be project member
- **INSERT tasks**: member with `can_create_task` or owner
- **UPDATE tasks**: creator OR member with `can_edit_task` OR owner
- **DELETE tasks**: member with `can_delete_task` OR owner
- **Archive tasks**: member with `can_archive_task` OR owner
- **Manage columns/tags**: member with `can_manage_columns` OR owner
- **Manage members**: member with `can_manage_members` OR owner

---

## PHASE 0: INFRASTRUCTURE ✅ PARTIAL

### 0.1 Supabase on Coolify
- [x] Deployed self-hosted Supabase on Coolify
- [x] All services healthy
- [x] SMTP configured (SendGrid)
- [ ] Set `SITE_URL` to frontend domain

### 0.2 Storage Buckets
- [ ] Create bucket `task-attachments`
- [ ] Create bucket `comment-attachments`
- [ ] Set storage policies

### 0.3 Run Database Migrations
- [ ] Run `001_full_schema.sql` in Studio SQL Editor
- [ ] Run `002_redesign.sql` in Studio SQL Editor (new: projects, columns, tags, members, archive)
- [ ] Run `003_default_column_and_task_ids.sql` in Studio SQL Editor (prefix, default_column_id, task_number + trigger)
- [ ] Run `004_multi_assignee.sql` in Studio SQL Editor (task_assignees table, backfill, drop assigned_to)
- [ ] Run `005_notifications.sql` in Studio SQL Editor (notifications table, comment/assignment triggers, Realtime)
- [ ] Verify tables: profiles, projects, project_columns, project_members, project_tags, tasks, task_tags, task_assignees, comments, notifications, attachments, activity_log
- [ ] Verify RLS policies active

---

## PHASE 1: PROJECT SCAFFOLDING ✅ COMPLETE

- [x] Vite 6 + React 19 + TypeScript 5
- [x] TanStack Router (file-based) + TanStack Query 5
- [x] Tailwind CSS v4 (dark+green theme)
- [x] @hello-pangea/dnd for drag-and-drop
- [x] Supabase client + env setup
- [x] Layout shell (AppShell, Sidebar, Header)
- [x] Dev server on port 3003

---

## PHASE 2: AUTH SYSTEM ✅ COMPLETE

- [x] Profiles table + auto-create trigger
- [x] AuthContext (user, profile, session, signIn, signUp, signOut)
- [x] Login + Signup pages
- [x] Route guards (`_app/route.tsx`)
- [x] Password reveal toggle (Eye/EyeOff) on login + signup pages
- [x] Fix: `getSession()` hanging forever (navigator.locks deadlock in React StrictMode)
  - `lockAcquireTimeout: 3000` in `src/lib/supabase.ts`
  - `.catch()` on `getSession()` + 5s safety timeout in `src/contexts/AuthContext.tsx`
  - `flowType: 'implicit'`, `detectSessionInUrl: false`

---

## PHASE 3: DATABASE REDESIGN ✅ COMPLETE

### Migration: `supabase/migrations/002_redesign.sql`
- [x] `project_columns` table (custom columns per project with slugs)
- [x] `project_members` table (membership + granular permissions)
- [x] `project_tags` table (custom tags per project with slugs + colors)
- [x] `task_tags` join table (many-to-many)
- [x] `projects.created_by` column
- [x] `tasks.column_id` + `tasks.archived` + `tasks.archived_at` columns
- [x] Data migration for existing "nonstop" project (status → columns, type → tags)
- [x] Dropped old `status` and `type` columns from tasks
- [x] Replaced ALL RLS policies with membership-based
- [x] `create_project_with_defaults()` DB function (creates project + owner member + 5 default columns + 4 default tags)
- [x] Performance indexes

---

## PHASE 4: CORE SERVICES + HOOKS ✅ COMPLETE

### Services
- [x] `src/services/projects.ts` — fetchMyProjects, fetchProjectBySlug, createProject (RPC), updateProject, deleteProject
- [x] `src/services/tasks.ts` — fetchTasks (with tags join, column filtering, archive filtering), fetchTask, createTask, updateTask, archiveTask, unarchiveTask, reorderTask, deleteTask
- [x] `src/services/columns.ts` — fetchColumns, createColumn, updateColumn, reorderColumns, deleteColumn
- [x] `src/services/tags.ts` — fetchTags, createTag, updateTag, deleteTag, setTaskTags
- [x] `src/services/members.ts` — fetchMembers, inviteMember, updateMemberPermissions, removeMember, toggleFavorite
- [x] `src/services/assignees.ts` — setTaskAssignees (delete + insert pattern)

### Hooks
- [x] `src/hooks/useProjects.ts` — useMyProjects, useProject(slug), useCreateProject, useUpdateProject, useDeleteProject
- [x] `src/hooks/useTasks.ts` — useTasks, useTask, useCreateTask, useUpdateTask, useArchiveTask, useUnarchiveTask, useReorderTask, useDeleteTask
- [x] `src/hooks/useColumns.ts` — useColumns, useCreateColumn, useUpdateColumn, useReorderColumns, useDeleteColumn
- [x] `src/hooks/useTags.ts` — useTags, useCreateTag, useUpdateTag, useDeleteTag, useSetTaskTags
- [x] `src/hooks/useMembers.ts` — useMembers, useInviteMember, useUpdatePermissions, useRemoveMember, useToggleFavorite
- [x] `src/hooks/useAssignees.ts` — useSetTaskAssignees

### Optimistic Updates
- [x] `useReorderTask` — optimistic drag-and-drop with rollback
- [x] `useArchiveTask` — task disappears from board instantly
- [x] `useUnarchiveTask` — task disappears from archive instantly
- [x] `useToggleFavorite` — star flips instantly (no spinner)
- [x] `useUpdateTask` — optimistic patch for column, priority, description (list + detail caches)
- [x] `useSetTaskTags` — optimistic with pre-resolved tag objects
- [x] `useSetTaskAssignees` — optimistic with pre-resolved assignee profiles

### Cache Invalidation Fixes
- [x] `useUpdateTag` / `useDeleteTag` — invalidate task queries so board reflects tag name/color changes immediately

### Context
- [x] `src/contexts/ProjectContext.tsx` — provides project, columns, tags, membership, permission helpers (canCreateTask, canEditTask, etc.)

---

## PHASE 5: ROUTES + PAGES ✅ COMPLETE

- [x] `/` → redirect to `/projects`
- [x] `/projects` — project list with favorites, cards grid, create dialog
- [x] `/p/:slug` — project layout (fetches project, wraps with ProjectProvider)
- [x] `/p/:slug/` — board view (kanban with custom columns)
- [x] `/p/:slug/archive` — archive view (list of archived tasks, restore to column)
- [x] `/p/:slug/settings` — settings (column manager, tag manager, member manager)
- [x] Deleted old `/board`, `/backlog`, `/settings` routes

---

## PHASE 6: COMPONENTS ✅ COMPLETE

### UI Components
- [x] `src/components/ui/Badge.tsx` — PriorityBadge, TagBadge (dynamic colors), exported TAG_COLOR_MAP
- [x] `src/components/ui/TagSelect.tsx` — multi-select dropdown with checkboxes
- [x] `src/components/ui/ColorPicker.tsx` — color swatch picker for tags
- [x] `src/components/ui/AssigneeSelect.tsx` — multi-select dropdown with avatars + checkboxes (follows TagSelect pattern)
- [x] `src/components/ui/ConfirmDialog.tsx` — reusable confirmation dialog (danger variant, isPending)
- [x] `src/components/ui/Dialog.tsx`, `Select.tsx`, `Avatar.tsx` — base UI

### Project Components
- [x] `src/components/project/CreateProjectDialog.tsx` — name + auto-slug, creates via RPC
- [x] `src/components/project/ProjectSwitcher.tsx` — header dropdown with search, favorites

### Settings Components
- [x] `src/components/settings/ProjectGeneralSettings.tsx` — prefix input (uppercase), default column dropdown, save with dirty-check
- [x] `src/components/settings/ColumnManager.tsx` — add/edit/delete/reorder columns
- [x] `src/components/settings/TagManager.tsx` — add/edit/delete tags with color picker
- [x] `src/components/settings/MemberManager.tsx` — invite by email, permission toggles, remove

### Board Components
- [x] `src/components/board/BoardContainer.tsx` — DragDropContext, groups tasks by column_id, passes default column + sprint column props, project update loading state
- [x] `src/components/board/BoardColumn.tsx` — Droppable column with count badge, Pin icon (default column) + Zap icon (sprint column) with loading states (managers only)
- [x] `src/components/board/SprintTaskSelectionPanel.tsx` — bulk-assign unassigned tasks to sprint, grouped by column
- [x] `src/components/board/TaskCard.tsx` — Draggable card with priority border, tag badges, stacked assignee avatars (max 3 + overflow), task ID (prefix-number)

### Task Components
- [x] `src/components/task/CreateTaskDialog.tsx` — column selector (defaults to project default column), tag multi-select, multi-assignee select
- [x] `src/components/task/TaskDetailPanel.tsx` — task ID in header, column/priority selectors, multi-assignee select, tag management, archive/unarchive, permission-gated

### Archive
- [x] `src/components/archive/ArchiveView.tsx` — list of archived tasks, column selector for restore, task ID display
- [x] Search input (client-side title filter with clear button)
- [x] Tag filter chips (clickable pills, OR logic, TAG_COLOR_MAP styling, "Clear" button)
- [x] Restore defaults to task's original column (not always first column)
- [x] Custom dropdown chevron (appearance-none + ChevronDown icon, tight spacing)
- [x] Optimistic archive/unarchive (instant UI feedback)

### Navigation
- [x] `src/components/layout/AppShell.tsx` — accepts projectSlug prop, passes to Sidebar + Header
- [x] `src/components/layout/Sidebar.tsx` — project-aware nav (Board/Archive/Settings when in project, Projects when on list)
- [x] `src/components/layout/Header.tsx` — ProjectSwitcher in header

---

## PHASE 7: BUILD VERIFICATION ✅ COMPLETE

- [x] `npx tsc --noEmit` — 0 type errors
- [x] `npm run build` — clean build (0 errors)
- [x] Route tree auto-generated with new `/p/$slug` routes

---

## PHASE 8: PROJECT CONFIGURATION ✅ COMPLETE

### 8.1 Default Column
- [x] DB migration: `projects.default_column_id` (FK → project_columns, on delete set null)
- [x] Types: add `default_column_id: string | null` to Project
- [x] UI: Pin icon on BoardColumn header (visible to managers only, permission-gated, toggle on/off)
- [x] UI: Default column dropdown in ProjectGeneralSettings
- [x] CreateTaskDialog uses `project.default_column_id` as pre-selected column
- [x] Fallback chain: `defaultColumnId` prop → `project.default_column_id` → first column

### 8.2 Task IDs (Prefix + Sequential Number)
- [x] DB migration: `projects.prefix` (text, default '')
- [x] DB migration: `tasks.task_number` (bigint, auto-assigned via trigger)
- [x] DB: unique constraint on (project_id, task_number)
- [x] DB: `assign_task_number()` trigger function — auto-assigns next number on insert
- [x] DB: Backfill existing tasks with sequential numbers by `created_at`
- [x] Types: add `prefix: string` to Project, `task_number: number` to Task
- [x] UI: Show task ID (e.g. "NT-1") on TaskCard, TaskDetailPanel, ArchiveView — everywhere
- [x] UI: Prefix input in ProjectGeneralSettings (uppercase, max 6 chars)
- [x] Only display ID when prefix is set (empty prefix = no ID shown)

### 8.3 General Project Settings Component
- [x] New: `src/components/settings/ProjectGeneralSettings.tsx`
  - Project prefix input (auto-uppercase)
  - Default column dropdown
  - Save button with dirty-check, uses `useUpdateProject`
- [x] Add to `settings.tsx` above ColumnManager (owners + managers)

### 8.4 Migration
- [x] `supabase/migrations/003_default_column_and_task_ids.sql`
  - `alter table projects add column default_column_id ...`
  - `alter table projects add column prefix ...`
  - `alter table tasks add column task_number ...`
  - Trigger + backfill + not null constraint

---

## PHASE 8.5: MULTI-ASSIGNEE ✅ COMPLETE

> Converted single `assigned_to` FK to many-to-many `task_assignees` join table. Prerequisite for notifications (all assignees get notified on comments).

### 8.5.1 Migration
- [x] `supabase/migrations/004_multi_assignee.sql`
  - Created `task_assignees` table (task_id, assignee_id FK → profiles, assigned_at)
  - Backfilled from `tasks.assigned_to` into `task_assignees`
  - Dropped `tasks.assigned_to` column
  - RLS policies: membership-based (same pattern as task_tags)
  - Index on assignee_id

### 8.5.2 Types
- [x] Removed `assigned_to: string | null` from `Task`
- [x] Replaced `assignee` with `assignees: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]` in `TaskWithRelations`
- [x] Updated `CreateTaskInput`: `assigned_to` → `assignee_ids?: string[]`
- [x] Updated `UpdateTaskInput`: removed `assigned_to` (assignees managed via separate service call)

### 8.5.3 Services
- [x] `src/services/tasks.ts` — fetchTasks/fetchTask join `task_assignees → profiles`, flatten to `assignees` array
- [x] `src/services/tasks.ts` — createTask handles `assignee_ids` (like `tag_ids`)
- [x] New: `src/services/assignees.ts` — `setTaskAssignees(taskId, assigneeIds)` (delete + insert pattern, same as setTaskTags)

### 8.5.4 Hooks
- [x] New: `src/hooks/useAssignees.ts` — `useSetTaskAssignees` mutation with cache invalidation

### 8.5.5 UI Updates
- [x] New: `src/components/ui/AssigneeSelect.tsx` — multi-select dropdown with avatars + checkboxes (follows TagSelect pattern)
- [x] `CreateTaskDialog` — uses `AssigneeSelect` multi-select, passes `assignee_ids` on create
- [x] `TaskDetailPanel` — uses `AssigneeSelect` with `useSetTaskAssignees` (same pattern as tag management)
- [x] `TaskCard` — stacked avatars (`-space-x-1.5`, ring-2, max 3 + overflow badge)
- [x] `ArchiveView` — stacked avatars (same pattern as TaskCard)

### 8.5.6 Build Verification
- [x] `npx tsc --noEmit` — passes clean

---

## PHASE 9: COMMENTS + NOTIFICATIONS ✅ COMPLETE

> Comments with @mention autocomplete. DB triggers create notifications server-side. Supabase Realtime for live updates. Notification deep links via `?task=` search param.

### 9.1 Migration
- [x] `supabase/migrations/005_notifications.sql`
  - `notifications` table (id, user_id, type, task_id, comment_id, actor_id, message, is_read, project_slug, created_at)
  - RLS: SELECT/UPDATE/DELETE own only. No INSERT policy (SECURITY DEFINER triggers handle inserts)
  - Partial index: `(user_id, is_read) WHERE is_read = false`
  - `notify_on_comment()` trigger (AFTER INSERT on comments): extracts @mentions via regex, unions assignees + previous commenters + mentioned, deduplicates, excludes author
  - `notify_on_assignment()` trigger (AFTER INSERT on task_assignees): notifies assignee, skips self-assign
  - Enabled Supabase Realtime on comments + notifications tables

### 9.2 Types
- [x] `NotificationType = 'comment' | 'mention' | 'assignment'`
- [x] `Comment`, `CommentWithAuthor`, `Notification`, `NotificationWithActor` interfaces

### 9.3 Mention Utilities
- [x] `src/lib/mentions.ts` — `encodeMention()`, `parseBody()` → `BodySegment[]`, `filterMembers()`, `MENTION_REGEX`
- [x] @mention format: `@[Display Name](uuid)` — parseable by Postgres regex + client-side JS

### 9.4 Comment Service + Hooks
- [x] `src/services/comments.ts` — fetchComments (with author join), createComment, updateComment, deleteComment
- [x] `src/hooks/useComments.ts` — useComments(taskId) with Realtime subscription (postgres_changes), useCreateComment, useUpdateComment, useDeleteComment

### 9.5 Notification Service + Hooks
- [x] `src/services/notifications.ts` — fetchNotifications (with actor join, limit 50), fetchUnreadCount, markAsRead, markAllAsRead
- [x] `src/hooks/useNotifications.ts` — useNotifications, useUnreadCount (30s refetchInterval), useNotificationRealtime (INSERT subscription), useMarkAsRead, useMarkAllAsRead

### 9.6 Comment Components
- [x] `src/components/comment/MentionDropdown.tsx` — keyboard-navigable @mention picker (arrow keys, Enter, Escape), max 5 visible
- [x] `src/components/comment/CommentItem.tsx` — avatar, name, timestamp, parsed body (mentions highlighted), edit/delete own, "(edited)" label
- [x] `src/components/comment/CommentForm.tsx` — textarea with @mention detection, `encodeMention()` insertion at cursor, Cmd/Ctrl+Enter submit
- [x] `src/components/comment/CommentList.tsx` — scrollable (max-h-64), auto-scroll on new comments, empty state
- [x] Integrated into TaskDetailPanel full-width below grid, with `max-h-[85vh] overflow-y-auto` on Dialog

### 9.7 Notification Components
- [x] `src/components/notification/NotificationBell.tsx` — bell icon + red badge (9+ cap), toggles dropdown, uses useUnreadCount + useNotificationRealtime
- [x] `src/components/notification/NotificationDropdown.tsx` — notification list with actor avatar, unread styling, click-outside-close, "Mark all read" button
- [x] Click notification → markAsRead + navigate to `/p/$slug?task=taskId`
- [x] Added NotificationBell to Header (between profile name and theme toggle)

### 9.8 Board Route Search Param
- [x] `validateSearch` on board route for `?task=` param
- [x] `useEffect` opens TaskDetailPanel from URL, clears param after consuming

### 9.9 Build Verification
- [x] `npx tsc --noEmit` — passes clean

---

## PHASE 10: FILE ATTACHMENTS ✅ COMPLETE

> Full attachment system: upload, preview, inline embedding, drag-to-reorder, drag-to-embed in rich editor.

### 10.1 Storage
- [x] Supabase storage bucket `attachments` with signed URL access
- [x] `src/services/attachments.ts` — uploadAttachment, deleteAttachment, getSignedUrl, reorderAttachments

### 10.2 Hooks
- [x] `src/hooks/useAttachments.ts` — useTaskAttachments, useCommentAttachments, useUploadAttachment, useDeleteAttachment, useReorderAttachments

### 10.3 Components
- [x] `src/components/attachment/FileUpload.tsx` — drag-and-drop zone + click to browse, file validation
- [x] `src/components/attachment/AttachmentList.tsx` — grid/list display with drag-to-reorder (@hello-pangea/dnd)
- [x] `src/components/attachment/AttachmentItem.tsx` — full + compact modes, image thumbnails with signed URLs, download, delete, cursor-pointer + hover effects for draggability

### 10.4 Integration
- [x] Task attachments in TaskDetailPanel (full mode with drag-to-reorder)
- [x] Comment attachments in CommentForm (upload on comment create) + CommentItem (compact mode, drag-to-reorder in edit mode)

---

## PHASE 10.5: RICH EDITOR + INLINE CONTENT ✅ COMPLETE

> ContentEditable rich editor for descriptions and comments. Supports @mentions, inline images, and file links. Shared utilities in `src/lib/rich-editor.ts`.

### 10.5.1 Rich Editor Utilities — `src/lib/rich-editor.ts`
- [x] `extractRawBody()` — walk contentEditable DOM → raw body string (mentions, images, file links)
- [x] `populateEditorFromBody()` — parse raw body → build DOM nodes, fetch signed URLs for inline images
- [x] `createMentionSpan()` — mention element creation
- [x] `insertPastedImage()` / `insertInlineImageAtCursor()` / `insertFileLinkAtCursor()` — inline insertion at cursor
- [x] `handleEditorBackspace()` — delete special elements (mentions, images, file links) on backspace
- [x] `parseAttachmentDrop()` / `handleAttachmentDrop()` — drag-from-attachment-list to embed inline
- [x] File utilities: `src/lib/file-utils.ts` — `isImageType()`, file type helpers

### 10.5.2 Inline Content Support
- [x] Inline images: `![](attachment_uuid)` — pasted images get temp IDs, uploaded on save, replaced with real IDs
- [x] File links: `%[filename](attachment_uuid)` — non-image attachments rendered as clickable file link spans
- [x] Drag-from-attachment-list: drag attachment onto editor → auto-insert inline image or file link
- [x] `InlineCommentImage` + `InlineFileLink` components for read-mode rendering

### 10.5.3 Description + Comment Editors
- [x] TaskDetailPanel description: contentEditable with mentions, inline images, file links, paste-to-upload
- [x] CommentForm: contentEditable with same rich features
- [x] CommentItem edit mode: contentEditable with pre-populated body

---

## PHASE 10.7: OPTIMISTIC UPDATES + BUG FIXES ✅ COMPLETE

> Made all task field updates optimistic. Fixed several UI bugs.

### 10.7.1 Optimistic Updates
- [x] `useUpdateTask` — optimistic patch for column, priority, description (patches both task list + detail caches)
- [x] `useSetTaskTags` — optimistic with pre-resolved tag objects from ProjectContext (avoids stale cache lookup)
- [x] `useSetTaskAssignees` — optimistic with pre-resolved assignee profiles from members data
- [x] Pattern: `onMutate` (cancel queries → snapshot → patch) → `onError` (rollback) → `onSettled` (invalidate)

### 10.7.2 Task Card Counts
- [x] `TaskWithRelations` — added `comment_count`, `attachment_count` fields
- [x] `fetchTasks` / `fetchTask` — Supabase aggregate `comments(count), attachments(count)` in select
- [x] `TaskCard` — shows MessageSquare + count, Paperclip + count (only when > 0)

### 10.7.3 Bug Fixes
- [x] Fix nested `<button>` React DOM warning: TagSelect + AssigneeSelect outer `<button>` → `<div role="button">` with keyboard support
- [x] Fix `extractRawBody` not handling `<div>`/`<p>` block elements browsers create in contentEditable
- [x] Fix zero-width space (`\u200B`) not stripped by `.trim()`, causing false-positive change detection
- [x] Fix description doubling on edit/read toggle: added `key` props to contentEditable + read divs (React contentEditable reconciliation bug)
- [x] Fix tag optimistic flicker: `useSetTaskTags` was reading from empty `tagKeys.all()` cache — now accepts pre-resolved tag objects
- [x] Fix comment attachment reorder: added DnD support in CommentItem edit mode
- [x] Attachment hover styling: cursor-pointer + subtle hover effects for draggable items

---

## PHASE 11: SPRINT MANAGEMENT ✅ COMPLETE

### 11.1 Migrations
- [x] `supabase/migrations/006_sprints.sql` — sprints table, RLS policies, indexes
- [x] `supabase/migrations/007_task_sprint.sql` — `tasks.sprint_id` FK to sprints
- [x] `supabase/migrations/008_story_points.sql` — `tasks.story_points` column
- [x] `supabase/migrations/009_can_manage_sprints.sql` — `can_manage_sprints` permission, updated `has_member_permission()`, permission-based sprint RLS
- [x] `supabase/migrations/010_default_sprint_duration.sql` — `projects.default_sprint_days` column

### 11.2 Services + Hooks
- [x] `src/services/sprints.ts` — fetchSprints, createSprint, updateSprint, deleteSprint, completeSprint
- [x] `src/hooks/useSprints.ts` — useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint, useCompleteSprint

### 11.3 Sprint Settings
- [x] `src/components/settings/SprintManager.tsx` — full sprint CRUD, start/complete workflow, complete-sprint dialog with task reassignment, default duration picker (weeks+days)
- [x] Sprint management gated by `canManageSprints` permission (not owner-only)
- [x] Default sprint duration stored per project (`default_sprint_days`), configurable in settings

### 11.4 Board Integration
- [x] `src/components/board/SprintFilterDropdown.tsx` — custom popover dropdown with sprint list (active/planning/completed sections), inline create, forwardRef imperative handle (`openCreate`, `startSprint`)
- [x] Sprint filter on board: All Tasks / No Sprint / specific sprint
- [x] Auto-default to active sprint on board load (if active sprint has tasks)
- [x] Contextual board header: "+ New Sprint" when no sprint selected, Start/Complete Sprint + Add Tasks when viewing a sprint
- [x] Sprint selector in CreateTaskDialog + TaskDetailPanel
- [x] Story points on TaskCard, CreateTaskDialog, TaskDetailPanel
- [x] Auto-assign tasks to active sprint when dragging into sprint column (`sprint_column_id`)

### 11.5 Sprint Rules
- [x] Max 1 active sprint enforced (toast error if trying to start another)
- [x] Complete sprint moves incomplete tasks to chosen target (another sprint or no sprint)

### 11.6 Permissions
- [x] `can_manage_sprints` granular permission on `project_members`
- [x] `canManageSprints` derived in ProjectContext (owner OR permission flag)
- [x] "Manage sprints" toggle in MemberManager

---

## PHASE 11.5: UI POLISH + SPRINT BOARD ACTIONS ✅ COMPLETE

> ConfirmDialog replacing native confirms, contextual sprint actions on board, loading states, sprint column icon.

### 11.5.1 ConfirmDialog Component
- [x] New: `src/components/ui/ConfirmDialog.tsx` — reusable confirmation dialog (title, description, danger variant, isPending support)
- [x] Replaced `window.confirm` in 5 files: SprintManager, MemberManager, ColumnManager, TagManager, TaskDetailPanel

### 11.5.2 Sprint Board Actions
- [x] Contextual board header buttons: when viewing a sprint, show Start Sprint / Complete Sprint + Add Tasks (replaces "+ New Sprint")
- [x] Complete Sprint dialog on board — move incomplete tasks to backlog or planning sprint (same as settings)
- [x] `SprintFilterDropdown` — `forwardRef` imperative handle: `openCreate()`, `startSprint(sprint)`
- [x] `SprintTaskSelectionPanel` — button fix: single "Skip" when no tasks selected, "Cancel" + "Add X Tasks" when selected

### 11.5.3 Loading States
- [x] Sprint operations (start/complete/delete) show `Loader2` spinner during mutation + refetch wait
- [x] `useIsFetching` pattern: track query key refetch state, combine with `isPending` for full loading coverage
- [x] Applied to: SprintManager (settings), BoardPage (board header), SprintFilterDropdown (play button)

### 11.5.4 Sprint Column Icon
- [x] `BoardColumn` — Zap icon (amber when active) for sprint column toggle, next to existing Pin icon for default column
- [x] `BoardContainer` — passes `isSprintColumn`, `onSetSprintColumn`, `isUpdating` to each column
- [x] Both Pin + Zap buttons: `Loader2` spinner during project update + refetch, disabled while updating
- [x] `isProjectUpdating = updateProject.isPending || useIsFetching({ queryKey: projectKeys.detail(slug) }) > 0`

---

## PHASE 12: MCP SERVER ✅ COMPLETE

> MCP server for AI agent access. Anon key + user auth (RLS-respecting). Agents use slugs + task IDs for natural queries. Tool descriptions guide agent behavior (ask before solving vague tasks).

### 12.1 Scaffold + Helpers
- [x] `mcp-server/` directory with `@modelcontextprotocol/sdk` + `@supabase/supabase-js` + `zod`
- [x] `package.json` (type: module), `tsconfig.json` (ES2022, Node16 resolution)
- [x] `src/supabase.ts` — client init (anon key), `authenticate()` via `signInWithPassword()`
- [x] `src/index.ts` — server setup, auth on startup, register all 8 tools, stdio transport
- [x] `src/helpers.ts` — `parseTaskId` (NT-1 or UUID), `resolveProject`, `resolveColumn`, `resolveTag`, `resolveSprint` ("active" keyword), `resolveAssignee`, `resolveTaskId`, `formatTaskId`, `formatTaskLine`

### 12.2 Read-only Tools
- [x] `list_projects` — all projects user is member of, with slug, name, prefix, member count
- [x] `list_tasks` — filter by project (slug), column (slug), tag (slug), sprint (name/"active"), assignee (name), priority, archived. Sprint-aware. Returns task IDs (NT-1) + route_path
- [x] `get_task` — full task by ID (NT-1 or UUID), with description, route_path, column, tags, assignees, sprint, story_points, last N comments (configurable `comment_limit`), attachment count
- [x] `search_tasks` — ilike search on title + description, up to 30 results
- [x] `get_attachment_url` — signed download URL (1hr expiry) with file metadata

### 12.3 Write Tools
- [x] `create_task` — project (slug), title, description, column (slug), priority, tags (slug array), assignees (email array), sprint (name), story_points, route_path
- [x] `update_task` — task_id + any updatable field (slugs for column/tags/sprint), replaces tags/assignees arrays entirely
- [x] `add_comment` — task_id + body, author from authenticated user

### 12.4 Agent Behavior (via tool descriptions)
- `get_task`: "Check route_path for page context. If description is vague, use add_comment to ask for clarification before investigating."
- `add_comment`: "Use to ask clarifying questions when task context is insufficient. Prefer asking over guessing."
- `list_tasks`: "Supports natural queries: filter by tag slug (e.g. 'bug'), column slug (e.g. 'review'), sprint name, assignee name."

### 12.5 MCP Query Examples
```
list_projects                                         → all projects
list_tasks project=nonstop column=todo                → tasks in todo
list_tasks project=nonstop tag=bug                    → all bugs (NT-1, NT-2...)
list_tasks project=nonstop tag=bug sprint="Sprint 1"  → bugs in Sprint 1
list_tasks project=nonstop archived=true              → archived tasks
get_task NT-1                                         → full task + comments + route_path
search_tasks project=nonstop query="email template"   → search by text
```

### 12.6 Environment + Config
```json
{
  "mcpServers": {
    "task-manager": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_ANON_KEY": "...",
        "SUPABASE_USER_EMAIL": "...",
        "SUPABASE_USER_PASSWORD": "..."
      }
    }
  }
}
```

---

## PHASE 13: DEPLOYMENT — TODO

- [ ] Dockerfile (Vite build + nginx)
- [ ] Deploy to Coolify
- [ ] Domain setup

---

## PHASE 14: POLISH — TODO

- [ ] Error boundaries
- [ ] Loading skeletons
- [ ] Keyboard shortcuts
- [ ] Mobile responsive board
- [ ] Pagination / virtualization
- [ ] Security audit
- [ ] MCP `read_attachment` tool — auto-download + extract zip attachments (prototypes), return file tree + contents to agent in one call. Eliminates manual download/extract/read workflow

---

## PHASE 14.1: SPRINT ANALYTICS (OPTIONAL) — TODO

> Requires sprints to be in active use with story points data. Only valuable after 3+ completed sprints.

- [ ] Burndown chart — remaining points/tasks over sprint days vs ideal line
- [ ] Velocity tracking — points completed per sprint, rolling average
- [ ] Capacity planning — team availability vs velocity estimate
- [ ] Sprint summary view — completed vs incomplete, carryover count

---

## PHASE 14.5: PENDING INVITES (OPTIONAL) — TODO

> Allow inviting users who haven't signed up yet. They receive an email, and on registration are auto-added to the project.

- [ ] `pending_invites` table (id, project_id, email, permissions JSON, invited_by, created_at)
- [ ] RLS: project members with `can_manage_members` can INSERT/SELECT/DELETE
- [ ] Unique constraint on (project_id, email)
- [ ] Update `inviteMember` service: if profile not found, insert into `pending_invites` + send invite email via Supabase/SendGrid
- [ ] DB trigger on `profiles` INSERT: check `pending_invites` for matching email, auto-create `project_members` rows, delete consumed invites
- [ ] UI: show pending invites in MemberManager (with "pending" badge, cancel button)
- [ ] Email template: "You've been invited to [project name] — sign up to get started"

---

## FILE STRUCTURE (Current)

```
task-manager/
├── src/
│   ├── components/
│   │   ├── archive/          # ArchiveView.tsx (search, tag filter, optimistic)
│   │   ├── attachment/       # AttachmentList.tsx, AttachmentItem.tsx, FileUpload.tsx
│   │   ├── board/            # BoardContainer.tsx, BoardColumn.tsx, TaskCard.tsx, SprintFilterDropdown.tsx, SprintTaskSelectionPanel.tsx
│   │   ├── comment/          # CommentList.tsx, CommentForm.tsx, CommentItem.tsx, MentionDropdown.tsx
│   │   ├── notification/     # NotificationBell.tsx, NotificationDropdown.tsx
│   │   ├── task/             # CreateTaskDialog.tsx, TaskDetailPanel.tsx
│   │   ├── project/          # CreateProjectDialog.tsx, ProjectSwitcher.tsx
│   │   ├── settings/         # ProjectGeneralSettings.tsx, ColumnManager.tsx, TagManager.tsx, MemberManager.tsx, SprintManager.tsx
│   │   ├── layout/           # AppShell.tsx, Sidebar.tsx, Header.tsx
│   │   └── ui/               # Badge.tsx, Dialog.tsx, ConfirmDialog.tsx, Select.tsx, Avatar.tsx, TagSelect.tsx, AssigneeSelect.tsx, ColorPicker.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── ProjectContext.tsx
│   ├── hooks/
│   │   ├── useProjects.ts
│   │   ├── useTasks.ts       # includes optimistic archive/unarchive/reorder/update
│   │   ├── useColumns.ts
│   │   ├── useTags.ts        # includes optimistic useSetTaskTags
│   │   ├── useMembers.ts     # includes optimistic toggleFavorite
│   │   ├── useAssignees.ts   # optimistic useSetTaskAssignees
│   │   ├── useAttachments.ts # useTaskAttachments, useCommentAttachments, upload/delete/reorder
│   │   ├── useComments.ts    # useComments + Realtime, CRUD mutations
│   │   ├── useNotifications.ts # useNotifications, useUnreadCount + Realtime, mark read
│   │   ├── useSprints.ts     # useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint, useCompleteSprint
│   │   ├── useBulkAssignSprint.ts # useBulkAssignSprint (bulk assign tasks to sprint)
│   │   └── useProfiles.ts
│   ├── services/
│   │   ├── projects.ts
│   │   ├── tasks.ts          # fetchTasks/fetchTask with comment_count, attachment_count
│   │   ├── columns.ts
│   │   ├── tags.ts
│   │   ├── members.ts
│   │   ├── assignees.ts      # setTaskAssignees
│   │   ├── attachments.ts    # uploadAttachment, deleteAttachment, getSignedUrl, reorderAttachments
│   │   ├── comments.ts       # fetchComments, createComment, updateComment, deleteComment
│   │   ├── notifications.ts  # fetchNotifications, unreadCount, markAsRead, markAllAsRead
│   │   ├── sprints.ts        # fetchSprints, createSprint, updateSprint, deleteSprint, completeSprint, autoAssignTasksToSprint
│   │   └── profiles.ts
│   ├── lib/
│   │   ├── supabase.ts       # lockAcquireTimeout fix
│   │   ├── mentions.ts       # encodeMention, parseBody, filterMembers, MENTION_REGEX
│   │   ├── rich-editor.ts    # contentEditable utilities (extractRawBody, populateEditor, inline insert)
│   │   ├── file-utils.ts     # isImageType, file type helpers
│   │   ├── constants.ts
│   │   ├── theme.ts
│   │   └── utils.ts
│   ├── types/
│   │   └── database.ts
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx           # redirect → /projects
│   │   ├── login.tsx           # password reveal toggle
│   │   ├── signup.tsx          # password reveal toggle
│   │   └── _app/
│   │       ├── route.tsx       # Auth guard
│   │       ├── projects.tsx    # Project list
│   │       ├── sprints.tsx     # Placeholder
│   │       └── p/
│   │           ├── $slug.tsx       # Project layout + ProjectProvider
│   │           └── $slug/
│   │               ├── index.tsx   # Board view
│   │               ├── archive.tsx # Archive view
│   │               └── settings.tsx # Project settings
│   ├── routeTree.gen.ts
│   └── main.tsx
├── supabase/
│   └── migrations/
│       ├── 001_full_schema.sql
│       ├── 002_redesign.sql
│       ├── 003_default_column_and_task_ids.sql
│       ├── 004_multi_assignee.sql
│       ├── 005_notifications.sql
│       ├── 006_sprints.sql
│       ├── 007_task_sprint.sql
│       ├── 008_story_points.sql
│       ├── 009_can_manage_sprints.sql
│       └── 010_default_sprint_duration.sql
├── .env.example
├── .env.local
├── vite.config.ts
├── tsconfig.json
├── package.json
├── mcp-server/              # MCP server for AI agent access
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts         # Server setup, auth, stdio transport
│       ├── supabase.ts      # Supabase client (anon key + user auth)
│       ├── helpers.ts       # Task ID parsing, slug resolution
│       └── tools/           # One file per MCP tool
└── todo/
    └── MASTER_TASK_LIST.md
```

---

## KEY TABLES

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup) |
| `projects` | Projects (name, slug, prefix, default_column_id, default_sprint_days, created_by) |
| `project_columns` | Custom columns per project (name, slug, position) |
| `project_members` | Membership + granular permissions (7 permission flags) |
| `project_tags` | Custom tags per project (name, slug, color) |
| `tasks` | Tasks (task_number, column_id, sprint_id, priority, story_points, archived, position) |
| `task_tags` | Many-to-many join (task ↔ tag) |
| `task_assignees` | Many-to-many join (task ↔ profiles) |
| `notifications` | Per-user notifications (comment, mention, assigned) |
| `sprints` | Sprint management |
| `comments` | Task comments (with @mention support) |
| `attachments` | File attachments |
| `activity_log` | Task activity history |

---

## TECH STACK

| Layer | Tech |
|-------|------|
| Framework | React 19 + TypeScript 5 |
| Build | Vite 6 |
| Routing | TanStack Router (file-based) |
| Data | TanStack Query 5 |
| Backend | Supabase (self-hosted on Coolify) |
| Styling | Tailwind CSS v4 |
| Drag & Drop | @hello-pangea/dnd |
| Icons | lucide-react |
| Toasts | sonner |
| Dates | date-fns |

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ArchiveRestore, ChevronDown, Search, X } from "lucide-react";
import { useTasks, useUnarchiveTask } from "@/hooks/useTasks";
import { useProjectContext } from "@/contexts/ProjectContext";
import { PriorityBadge, TagBadge, TAG_COLOR_MAP } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDistanceToNow } from "date-fns";

interface ArchiveViewProps {
  projectId: string;
}

export function ArchiveView({ projectId }: ArchiveViewProps) {
  const { project, columns, tags: projectTags, canArchiveTask } = useProjectContext();
  const { data: tasks, isLoading } = useTasks(projectId, { archived: true });
  const unarchiveTask = useUnarchiveTask(projectId);

  const [restoreColumnId, setRestoreColumnId] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    let result = tasks;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }

    if (selectedTagIds.length > 0) {
      result = result.filter((t) =>
        t.tags?.some((tag) => selectedTagIds.includes(tag.id))
      );
    }

    return result;
  }, [tasks, search, selectedTagIds]);

  const handleUnarchive = (taskId: string, originalColumnId: string) => {
    const columnId = restoreColumnId[taskId] || originalColumnId || columns[0]?.id;
    if (!columnId) return;

    unarchiveTask.mutate(
      { taskId, columnId },
      {
        onSuccess: () => toast.success("Task restored"),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!tasks?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No archived tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + Tag Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search archived tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pl-8 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {projectTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {projectTags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              const colorClass = TAG_COLOR_MAP[tag.color] ?? "bg-muted text-muted-foreground";
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${colorClass} ${
                    active
                      ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p className="text-sm">No matching archived tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {project.prefix && (
                    <span className="text-[10px] font-medium text-muted-foreground font-mono shrink-0">
                      {project.prefix}-{task.task_number}
                    </span>
                  )}
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <PriorityBadge priority={task.priority} />
                  {task.tags?.map((tag) => (
                    <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </div>
              </div>

              {task.assignees && task.assignees.length > 0 && (
                <div className="flex -space-x-1.5">
                  {task.assignees.slice(0, 3).map((a) => (
                    <Avatar
                      key={a.id}
                      name={a.full_name}
                      url={a.avatar_url}
                      size="sm"
                      className="ring-2 ring-card"
                    />
                  ))}
                  {task.assignees.length > 3 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                      +{task.assignees.length - 3}
                    </div>
                  )}
                </div>
              )}

              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {task.archived_at
                  ? formatDistanceToNow(new Date(task.archived_at), {
                      addSuffix: true,
                    })
                  : ""}
              </span>

              {canArchiveTask && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={restoreColumnId[task.id] || task.column_id || columns[0]?.id || ""}
                      onChange={(e) =>
                        setRestoreColumnId((s) => ({
                          ...s,
                          [task.id]: e.target.value,
                        }))
                      }
                      className="appearance-none rounded-md border border-input bg-background pl-2 pr-5 py-1 text-xs text-foreground"
                    >
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <button onClick={() => handleUnarchive(task.id, task.column_id)} disabled={unarchiveTask.isPending} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restore
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

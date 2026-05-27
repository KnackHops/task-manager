import { useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useCreateProject } from '@/hooks/useProjects'

interface CreateProjectDialogProps {
  onClose: () => void
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function CreateProjectDialog({ onClose }: CreateProjectDialogProps) {
  const createProject = useCreateProject()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  const handleNameChange = (val: string) => {
    setName(val)
    if (!slugEdited) {
      setSlug(slugify(val))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    createProject.mutate(
      { name: name.trim(), slug: slug.trim() },
      {
        onSuccess: () => {
          toast.success('Project created')
          onClose()
          navigate({ to: '/p/$slug', params: { slug: slug.trim() }, search: { task: undefined, sprint: undefined } })
        },
        onError: (err) => {
          toast.error(err.message)
        },
      }
    )
  }

  return (
    <Dialog open onClose={onClose} className="max-w-md">
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="project-name"
            className="text-sm font-medium text-foreground"
          >
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            autoFocus
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="My Project"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="project-slug"
            className="text-sm font-medium text-foreground"
          >
            Slug
          </label>
          <input
            id="project-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(slugify(e.target.value))
              setSlugEdited(true)
            }}
            required
            pattern="[a-z0-9-]+"
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
            placeholder="my-project"
          />
          <p className="text-xs text-muted-foreground">
            Used in URLs and MCP commands: /p/{slug || 'my-project'}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createProject.isPending || !name.trim() || !slug.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

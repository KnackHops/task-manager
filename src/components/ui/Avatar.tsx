import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  url?: string | null
  size?: 'sm' | 'md'
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Avatar({ name, url, size = 'sm', className }: AvatarProps) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={cn(
          'rounded-full object-cover',
          sizeClasses,
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/20 font-medium text-primary',
        sizeClasses,
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}

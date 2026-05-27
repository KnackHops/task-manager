import { cn } from '@/lib/utils'
import { TAG_COLORS } from './Badge'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

const COLOR_SWATCHES: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  cyan: 'bg-cyan-500',
  gray: 'bg-gray-500',
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full transition-all',
            COLOR_SWATCHES[color] ?? 'bg-gray-500',
            value === color
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110'
              : 'hover:scale-110'
          )}
          title={color}
        />
      ))}
    </div>
  )
}

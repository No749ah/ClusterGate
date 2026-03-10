import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/20 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
        outline: 'text-foreground',
        success: 'border-green-500/30 bg-green-500/10 text-green-500',
        warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
        info: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
        purple: 'border-purple-500/30 bg-purple-500/10 text-purple-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }

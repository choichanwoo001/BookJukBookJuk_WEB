import type { ButtonHTMLAttributes, ReactNode } from 'react'

type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tab'
type AppButtonSize = 'sm' | 'md'

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant
  size?: AppButtonSize
  active?: boolean
  fullWidth?: boolean
  children: ReactNode
}

export default function AppButton({
  variant = 'secondary',
  size = 'md',
  active = false,
  fullWidth = false,
  className,
  children,
  ...buttonProps
}: AppButtonProps) {
  const classNames = [
    'appButton',
    `appButton-${variant}`,
    `appButton-${size}`,
    active ? 'appButton-active' : '',
    fullWidth ? 'appButton-fullWidth' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classNames} data-active={active || undefined} {...buttonProps}>
      {children}
    </button>
  )
}

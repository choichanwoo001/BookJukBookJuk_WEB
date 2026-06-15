type FullscreenToggleButtonProps = {
  isFullscreen: boolean
  onToggle: () => void
  className?: string
}

export default function FullscreenToggleButton({
  isFullscreen,
  onToggle,
  className,
}: FullscreenToggleButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      aria-pressed={isFullscreen}
      aria-label={isFullscreen ? '전체화면 종료' : '전체화면'}
    >
      {isFullscreen ? '전체화면 종료' : '전체화면'}
    </button>
  )
}

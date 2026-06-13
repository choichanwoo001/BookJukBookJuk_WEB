import type { ReactNode } from 'react'

type OnboardingBrandHeaderProps = {
  tagline: string
  children?: ReactNode
}

export default function OnboardingBrandHeader({ tagline, children }: OnboardingBrandHeaderProps) {
  return (
    <header className="onboardingIntro">
      <h1 className="onboardingBrand">Sancheck</h1>
      <h2 className="onboardingTagline">{tagline}</h2>
      {children}
    </header>
  )
}

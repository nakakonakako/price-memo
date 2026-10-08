import { createContext, useContext } from 'react'

export type GuideThemeName = 'stone' | 'teal' | 'amber' | 'sky'

export type GuideTheme = {
  surface: string
  heading: string
  number: string
  leadBar: string
  leadBg: string
  marker: string
  emphasis: string
  divider: string
}

/** Guide-only accents. Mock UI inside sections keeps the real app colors. */
export const GUIDE_THEMES: Record<GuideThemeName, GuideTheme> = {
  stone: {
    surface:
      'border-stone-300/80 bg-gradient-to-b from-stone-100/70 to-white shadow-sm',
    heading: 'border-stone-300/80 bg-stone-100',
    number: 'text-stone-700',
    leadBar: 'bg-stone-500',
    leadBg: 'border-stone-300/60 bg-stone-50',
    marker: 'border-stone-500 bg-stone-100 text-stone-900',
    emphasis: 'text-stone-900',
    divider: 'border-stone-300/80',
  },
  teal: {
    surface:
      'border-teal-200/90 bg-gradient-to-b from-teal-50/70 to-white shadow-sm',
    heading: 'border-teal-200/90 bg-teal-50',
    number: 'text-teal-700',
    leadBar: 'bg-teal-500',
    leadBg: 'border-teal-200/60 bg-teal-50/60',
    marker: 'border-teal-600 bg-teal-50 text-teal-900',
    emphasis: 'text-teal-800',
    divider: 'border-teal-200/80',
  },
  amber: {
    surface:
      'border-amber-200/90 bg-gradient-to-b from-amber-50/70 to-white shadow-sm',
    heading: 'border-amber-200/90 bg-amber-50',
    number: 'text-amber-700',
    leadBar: 'bg-amber-500',
    leadBg: 'border-amber-200/60 bg-amber-50/60',
    marker: 'border-amber-600 bg-amber-50 text-amber-900',
    emphasis: 'text-amber-800',
    divider: 'border-amber-200/80',
  },
  sky: {
    surface:
      'border-sky-200/90 bg-gradient-to-b from-sky-50/70 to-white shadow-sm',
    heading: 'border-sky-200/90 bg-sky-50',
    number: 'text-sky-700',
    leadBar: 'bg-sky-500',
    leadBg: 'border-sky-200/60 bg-sky-50/60',
    marker: 'border-sky-600 bg-sky-50 text-sky-900',
    emphasis: 'text-sky-800',
    divider: 'border-sky-200/80',
  },
}

export const GuideThemeContext = createContext<GuideTheme>(GUIDE_THEMES.stone)

export function useGuideTheme(): GuideTheme {
  return useContext(GuideThemeContext)
}

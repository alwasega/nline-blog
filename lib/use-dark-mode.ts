import { useEffect, useState } from 'react'

const STORAGE_KEY = 'darkMode'
const CLASS_NAME_DARK = 'dark-mode'

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // Mark as client-side after mount
    setIsClient(true)

    // Only access localStorage on the client
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored !== null) {
          setIsDarkMode(JSON.parse(stored))
        } else {
          // Check system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          setIsDarkMode(prefersDark)
        }
      } catch (err) {
        // localStorage might be disabled, use default
        setIsDarkMode(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!isClient) return

    // Update body class when dark mode changes
    if (typeof document !== 'undefined') {
      if (isDarkMode) {
        document.body.classList.add(CLASS_NAME_DARK)
        document.body.classList.remove('light-mode')
      } else {
        document.body.classList.remove(CLASS_NAME_DARK)
        document.body.classList.add('light-mode')
      }
    }

    // Save to localStorage
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(isDarkMode))
      } catch (err) {
        // Ignore localStorage errors
      }
    }
  }, [isDarkMode, isClient])

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev)
  }

  return {
    isDarkMode,
    toggleDarkMode
  }
}

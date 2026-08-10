import * as React from 'react'

import * as types from 'notion-types'
import { IoMoonSharp } from 'react-icons/io5'
import { IoSunnyOutline } from 'react-icons/io5'
import cs from 'classnames'
import { Header, Search, useNotionContext } from 'react-notion-x'

import { isSearchEnabled, name, navigationLinks, navigationStyle, rootNotionPageId } from '@/lib/config'
import { useDarkMode } from '@/lib/use-dark-mode'
import { getBlockTitle, uuidToId } from 'notion-utils'

import styles from './styles.module.css'

function ToggleThemeButton() {
  const [hasMounted, setHasMounted] = React.useState(false)
  const { isDarkMode, toggleDarkMode } = useDarkMode()

  React.useEffect(() => {
    setHasMounted(true)
  }, [])

  const onToggleTheme = React.useCallback(() => {
    toggleDarkMode()
  }, [toggleDarkMode])

  return (
    <div
      className={cs('breadcrumb', 'button', !hasMounted && styles.hidden)}
      onClick={onToggleTheme}
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  )
}

export function NotionPageHeader({
  block
}: {
  block: types.CollectionViewPageBlock | types.PageBlock
}) {
  const { components, mapPageUrl, recordMap } = useNotionContext()
  const [showTitle, setShowTitle] = React.useState(false)
  const title = getBlockTitle(block, recordMap)
  const isRootPage = uuidToId(block.id) === rootNotionPageId

  React.useEffect(() => {
    const titleElement = document.querySelector('.notion-title')
    if (!titleElement) return

    const observer = new IntersectionObserver(
      ([entry]) => setShowTitle(!entry.isIntersecting),
      { threshold: 0 }
    )

    observer.observe(titleElement)
    return () => observer.disconnect()
  }, [])

  if (navigationStyle === 'default') {
    return <Header block={block} />
  }

  return (
    <header className='notion-header'>
      <div className='notion-nav-header'>
        <div className='breadcrumbs'>
          {isRootPage ? (
            <div className='breadcrumb active'>{name}</div>
          ) : (
            <components.PageLink
              href={mapPageUrl(rootNotionPageId)}
              className='breadcrumb button'
            >
              {name}
            </components.PageLink>
          )}
        </div>

        <div
          className={`notion-nav-header-title breadcrumbs ${showTitle ? 'show' : ''}`}
        >
          {title}
        </div>

        <div className='notion-nav-header-rhs breadcrumbs'>
          {navigationLinks
            ?.map((link, index) => {
              if (!link.pageId && !link.url) {
                return null
              }

              if (link.pageId) {
                return (
                  <components.PageLink
                    href={mapPageUrl(link.pageId)}
                    key={index}
                    className={cs(styles.navLink, 'breadcrumb', 'button')}
                  >
                    {link.title}
                  </components.PageLink>
                )
              } else {
                return (
                  <components.Link
                    href={link.url}
                    key={index}
                    className={cs(styles.navLink, 'breadcrumb', 'button')}
                  >
                    {link.title}
                  </components.Link>
                )
              }
            })
            .filter(Boolean)}

          <ToggleThemeButton />

          {isSearchEnabled && <Search block={block} title={null} />}
        </div>
      </div>
    </header>
  )
}

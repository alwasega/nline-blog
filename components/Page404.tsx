import type * as types from '@/lib/types'

import { PageHead } from './PageHead'
import styles from './styles.module.css'
import * as config from '@/lib/config'

export function Page404({ site, pageId, error }: types.PageProps) {
  const title = site?.name || 'Page Not Found'

  return (
    <>
      <PageHead site={site} title={title} />

      <div className={styles.container}>
        <main className={styles.main}>
          <h1>Page not found</h1>

          {error ? (
            <p>{error.message}</p>
          ) : (
            pageId && (
              <p>
                Make sure that Notion page &quot;{pageId}&quot; is publicly
                accessible.
              </p>
            )
          )}
          <h3>
            <a className='notion-link' href={config.host}>
              Return home
            </a>
          </h3>

          <img
            src='/404.png'
            alt='404 Not Found'
            className={styles.errorImage}
          />
        </main>
      </div>
    </>
  )
}

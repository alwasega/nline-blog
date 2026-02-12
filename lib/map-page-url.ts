import { type ExtendedRecordMap } from 'notion-types'
import { parsePageId, uuidToId } from 'notion-utils'

import { includeNotionIdInUrls } from './config'
import { getCanonicalPageId } from './get-canonical-page-id'
import { type Site } from './types'

// include UUIDs in page URLs during local development but not in production
// (they're nice for debugging and speed up local dev)
const uuid = !!includeNotionIdInUrls

export const mapPageUrl =
  (site: Site, recordMap: ExtendedRecordMap, searchParams: URLSearchParams) =>
  (pageId = '') => {
    const pageUuid = parsePageId(pageId, { uuid: true })

    if (uuidToId(pageUuid) === site.rootNotionPageId) {
      return createUrl('/', searchParams)
    } else {
      return createUrl(
        `/${getCanonicalPageId(pageUuid, recordMap, { uuid })}`,
        searchParams
      )
    }
  }

export const getCanonicalPageUrl =
  (site: Site, recordMap: ExtendedRecordMap) =>
  (pageId = '') => {
    const pageUuid = parsePageId(pageId, { uuid: true })
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'

    if (uuidToId(pageId) === site.rootNotionPageId) {
      return `${protocol}://${site.domain}`
    } else {
      return `${protocol}://${site.domain}/${getCanonicalPageId(
        pageUuid,
        recordMap,
        {
          uuid
        }
      )}`
    }
  }

function createUrl(path: string, searchParams: URLSearchParams) {
  return [path, searchParams.toString()].filter(Boolean).join('?')
}

import { getAllPagesInSpace, getPageProperty, uuidToId } from 'notion-utils'
import pMemoize from 'p-memoize'

import * as config from './config'
import type { ExtendedRecordMap, SiteMap } from './types'
import { getCanonicalPageId } from './get-canonical-page-id'
import { getPage as getHydratedPage } from './notion'
import { notion } from './notion-api'

const uuid = !!config.includeNotionIdInUrls

export async function getSiteMap(): Promise<SiteMap> {
  const partialSiteMap = await getAllPages(
    config.rootNotionPageId,
    config.rootNotionSpaceId
  )

  return {
    site: config.site,
    ...partialSiteMap
  } as SiteMap
}

const getAllPages = pMemoize(getAllPagesImpl, {
  cacheKey: (...args) => JSON.stringify(args)
})

/** notion-utils reads `blockIds`; notion-client puts row ids in `collection_group_results.blockIds`. */
function ensureBlockIdsForAllPagesInSpaceTraversal(
  recordMap: ExtendedRecordMap
): void {
  const cq = (recordMap as any).collection_query
  if (!cq || typeof cq !== 'object') return

  for (const views of Object.values(cq)) {
    if (!views || typeof views !== 'object') continue
    for (const viewId of Object.keys(views as Record<string, unknown>)) {
      const data = (views as any)[viewId]
      if (!data || typeof data !== 'object') continue
      const blockIds = data.collection_group_results?.blockIds || data.blockIds
      if (Array.isArray(blockIds) && data.blockIds == null) {
        ;(views as any)[viewId] = { ...data, blockIds }
      }
    }
  }
}

const getPage = async (pageId: string) => {
  console.log('\nnotion getPage', uuidToId(pageId))
  const recordMap = await notion.getPage(pageId, {
    fetchMissingBlocks: false,
    fetchCollections: true,
    signFileUrls: false
  })
  ensureBlockIdsForAllPagesInSpaceTraversal(recordMap)
  return recordMap
}

function registerCanonicalPathsForPage(
  map: Record<string, string>,
  pageId: string,
  recordMap: ExtendedRecordMap
): Record<string, string> {
  const primary = getCanonicalPageId(pageId, recordMap, { uuid })
  const slugOnly = getCanonicalPageId(pageId, recordMap, { uuid: false })
  const pathKeys = new Set<string>()
  if (primary) pathKeys.add(primary)
  if (uuid && slugOnly && slugOnly !== primary) pathKeys.add(slugOnly)

  let next = map
  for (const pathKey of pathKeys) {
    if (!pathKey) continue
    if (next[pathKey]) {
      if (next[pathKey] !== pageId) {
        console.warn('error duplicate canonical page id', {
          pathKey,
          pageId,
          existingPageId: next[pathKey]
        })
      }
      continue
    }
    next = { ...next, [pathKey]: pageId }
  }
  return next
}

/** Merge slug keys from the hydrated root page so paths match `mapPageUrl` / the index. */
async function mergeCanonicalPathsFromHydratedRoot(
  base: Record<string, string>
): Promise<Record<string, string>> {
  let merged = { ...base }
  try {
    const recordMap = await getHydratedPage(config.rootNotionPageId)
    const cq = (recordMap as any).collection_query
    if (!cq) return merged

    const collectionPageIds = new Set<string>()
    for (const views of Object.values(cq)) {
      if (!views || typeof views !== 'object') continue
      for (const q of Object.values(views as Record<string, unknown>)) {
        const data = q as any
        const blockIds =
          data?.collection_group_results?.blockIds || data?.blockIds || []
        if (!Array.isArray(blockIds)) continue
        for (const id of blockIds) collectionPageIds.add(id)
      }
    }

    for (const pageId of collectionPageIds) {
      const blockRec = (recordMap as any).block?.[pageId]
      const block = (blockRec?.value as any)?.value || blockRec?.value
      if (!block || block.type !== 'page') continue
      if (
        !(getPageProperty<boolean | null>('Public', block, recordMap) ?? true)
      ) {
        continue
      }
      merged = registerCanonicalPathsForPage(merged, pageId, recordMap)
    }
  } catch (err: any) {
    console.warn('mergeCanonicalPathsFromHydratedRoot failed', err?.message)
  }
  return merged
}

async function getAllPagesImpl(
  rootNotionPageId: string,
  rootNotionSpaceId: string
): Promise<Partial<SiteMap>> {
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    getPage
  )

  const fromWalk = Object.keys(pageMap).reduce(
    (map, pageId: string) => {
      const recordMap = pageMap[pageId]
      if (!recordMap) {
        console.warn('skipping page due to load failure', { pageId })
        return map
      }

      const blockRecord = recordMap.block[pageId]
      const block = (blockRecord?.value as any)?.value || blockRecord?.value
      if (
        !(getPageProperty<boolean | null>('Public', block, recordMap) ?? true)
      ) {
        return map
      }

      return registerCanonicalPathsForPage(map, pageId, recordMap)
    },
    {} as Record<string, string>
  )

  const canonicalPageMap = await mergeCanonicalPathsFromHydratedRoot(fromWalk)

  return {
    pageMap,
    canonicalPageMap
  }
}

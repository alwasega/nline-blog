import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'

import {
  isPreviewImageSupportEnabled,
  navigationLinks,
  navigationStyle,
  rootNotionPageId
} from './config'
import { notion } from './notion-api'
import { getPreviewImageMap } from './preview-images'

/**
 * Sanitizes a recordMap by ensuring all blocks have valid IDs.
 * This prevents errors when react-notion-x tries to call uuidToId with undefined.
 * In Notion's recordMap, the key is the block ID, so we ensure value.id matches the key.
 */
function sanitizeRecordMap(recordMap: ExtendedRecordMap): ExtendedRecordMap {
  if (!recordMap?.block) {
    return recordMap
  }

  const sanitizedBlocks: typeof recordMap.block = {}
  
  for (const [key, blockRecord] of Object.entries(recordMap.block)) {
    if (!blockRecord?.value) {
      // Skip blocks without a value
      continue
    }

    // Ensure the block has an ID - use the key as fallback if value.id is missing
    if (!blockRecord.value.id && key) {
      blockRecord.value.id = key
    }

    // Only include blocks that have a valid ID (either from value.id or key)
    if (blockRecord.value.id) {
      sanitizedBlocks[key] = blockRecord
    }
  }

  return {
    ...recordMap,
    block: sanitizedBlocks
  }
}

const getNavigationLinkPages = pMemoize(
  async (): Promise<ExtendedRecordMap[]> => {
    const navigationLinkPageIds = (navigationLinks || [])
      .map((link) => link.pageId)
      .filter(Boolean)

    if (navigationStyle !== 'default' && navigationLinkPageIds.length) {
      return pMap(
        navigationLinkPageIds,
        async (navigationLinkPageId) =>
          notion.getPage(navigationLinkPageId, {
            chunkLimit: 1,
            fetchMissingBlocks: false,
            fetchCollections: false,
            signFileUrls: false
          }),
        {
          concurrency: 4
        }
      )
    }

    return []
  }
)

export async function getPage(pageId: string): Promise<ExtendedRecordMap> {
  let recordMap = await notion.getPage(pageId)
  if (navigationStyle !== 'default' && rootNotionPageId === pageId) {
    // ensure that any pages linked to in the custom navigation header have
    // their block info fully resolved in the page record map so we know
    // the page title, slug, etc.
    const navigationLinkRecordMaps = await getNavigationLinkPages()

    if (navigationLinkRecordMaps?.length) {
      recordMap = navigationLinkRecordMaps.reduce(
        (map, navigationLinkRecordMap) =>
          mergeRecordMaps(map, navigationLinkRecordMap),
        recordMap
      )
    }
  }

  if (isPreviewImageSupportEnabled) {
    const previewImageMap = await getPreviewImageMap(recordMap)
    ;(recordMap as any).preview_images = previewImageMap
  }

  // Sanitize the recordMap to remove blocks without valid IDs
  return sanitizeRecordMap(recordMap)
}

export async function search(params: SearchParams): Promise<SearchResults> {
  return notion.search(params)
}

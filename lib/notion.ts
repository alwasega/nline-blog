import {
  type ExtendedRecordMap,
  type SearchParams,
  type SearchResults
} from 'notion-types'
import { mergeRecordMaps, parsePageId, uuidToId } from 'notion-utils'
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

  // First pass: collect all block IDs that are referenced in content arrays
  // These are the blocks that will actually be rendered
  // Normalize all block keys to a consistent format for comparison
  // Create bidirectional maps: normalized <-> original, and also original -> original
  const normalizedBlockKeys = new Map<string, string>() // normalized -> original
  const allBlockKeysSet = new Set<string>()
  for (const key of Object.keys(recordMap.block)) {
    allBlockKeysSet.add(key)
    const normalized = parsePageId(key, { uuid: false }) || key
    normalizedBlockKeys.set(normalized, key)
    // Also map the original key to itself (in case it's already in the format we need)
    normalizedBlockKeys.set(key, key)
  }

  const referencedBlockIds = new Set<string>()
  const missingBlockIds = new Set<string>()

  for (const [key, blockRecord] of Object.entries(recordMap.block)) {
    // Check if block has content array - handle nested value structure
    // Some blocks have blockRecord.value.value instead of blockRecord.value directly
    const blockValue = (blockRecord?.value as any)?.value || blockRecord?.value
    if (blockValue?.content && Array.isArray(blockValue.content)) {
      for (const childId of blockValue.content) {
        if (typeof childId === 'string') {
          // Try multiple formats to find the block
          // 1. Try the childId as-is
          // 2. Try normalized (undashed)
          // 3. Try with dashes if it's undashed
          let actualKey: string | undefined = undefined

          // First try the childId as-is
          if (allBlockKeysSet.has(childId)) {
            actualKey = childId
          } else {
            // Try normalized version
            const normalizedChildId =
              parsePageId(childId, { uuid: false }) || childId
            actualKey = normalizedBlockKeys.get(normalizedChildId)

            // If still not found, try adding dashes if it's a 32-char hex string
            if (
              !actualKey &&
              normalizedChildId.length === 32 &&
              /^[0-9a-f]+$/i.test(normalizedChildId)
            ) {
              const dashedId = `${normalizedChildId.slice(0, 8)}-${normalizedChildId.slice(8, 12)}-${normalizedChildId.slice(12, 16)}-${normalizedChildId.slice(16, 20)}-${normalizedChildId.slice(20)}`
              if (allBlockKeysSet.has(dashedId)) {
                actualKey = dashedId
              }
            }
          }

          if (actualKey) {
            referencedBlockIds.add(actualKey)
          } else {
            // Track missing blocks for summary logging
            missingBlockIds.add(childId)
          }
        }
      }
    }
  }

  // Log summary of missing blocks instead of individual warnings
  if (missingBlockIds.size > 0) {
    console.warn(
      `${missingBlockIds.size} blocks referenced in content arrays were not found in recordMap. This is expected if fetchMissingBlocks doesn't fetch all children due to API limits.`
    )
  }

  const sanitizedBlocks: typeof recordMap.block = {}

  for (const [key, blockRecord] of Object.entries(recordMap.block)) {
    if (!blockRecord?.value) {
      // Skip blocks without a value
      continue
    }

    // Handle nested value structure: blockRecord.value.value or blockRecord.value
    // react-notion-x expects blockRecord.value to BE the block, not a wrapper
    const hasNestedValue = !!(blockRecord.value as any)?.value
    const actualBlock = hasNestedValue
      ? (blockRecord.value as any).value
      : blockRecord.value

    // CRITICAL: If we have a nested structure, flatten it by replacing blockRecord.value
    // with the actual block. react-notion-x expects blockRecord.value to be the block itself.
    if (hasNestedValue && actualBlock) {
      // Preserve any properties from the wrapper that might be needed (like 'role')
      const wrapperProps = { ...(blockRecord.value as any) }
      delete wrapperProps.value // Remove the nested value
      // Merge wrapper properties into the actual block, but block properties take precedence
      blockRecord.value = { ...wrapperProps, ...actualBlock } as any
    }

    // Now blockRecord.value is guaranteed to be the actual block
    const blockValue = blockRecord.value

    // Ensure the block has an ID - use the key as fallback if value.id is missing or empty
    // In Notion's recordMap, the key IS the block ID, so we can always use it
    const blockId = key || blockValue?.id
    if (blockId && (!blockValue.id || blockValue.id === '')) {
      blockValue.id = blockId
    }

    // Set types for ALL blocks that don't have them
    // This is necessary because react-notion-x requires types for all blocks it might access
    const hadType = !!blockValue.type
    if (!blockValue.type) {
      // Try to infer type from block structure
      if (blockValue.properties) {
        // Blocks with properties are usually text blocks (most common content type)
        blockValue.type = 'text'
      } else if (blockValue.content && Array.isArray(blockValue.content)) {
        // Blocks with content arrays are container blocks
        blockValue.type = 'column_list'
      } else if (blockValue.parent_table === 'collection') {
        // Collection-related blocks
        blockValue.type = 'page'
      } else {
        // Default fallback - use 'text' as it's a valid and common Notion block type
        blockValue.type = 'text'
      }
    }

    // Verify the type was set (for debugging)
    if (!hadType && !blockValue.type) {
      console.warn(`Failed to set type for block ${key}`, {
        hasProperties: !!blockValue.properties,
        hasContent: !!blockValue.content,
        parentTable: blockValue.parent_table
      })
    }

    // Include ALL blocks from the recordMap - don't filter any out
    // The key is always the block ID in Notion's recordMap structure
    // We just need to ensure blockRecord.value.id is set for react-notion-x
    if (key && typeof key === 'string' && key.length > 0) {
      // Always set the ID - use the key as it's the canonical block ID
      const finalId = key

      // Set id on blockRecord.value (what react-notion-x reads)
      // Since we've flattened the structure, blockRecord.value IS the block
      if (!blockValue.id || blockValue.id === '') {
        blockValue.id = finalId
      }

      // Store block with original key
      sanitizedBlocks[key] = blockRecord

      // Also store with normalized (undashed) key if different
      // This ensures react-notion-x can find blocks when it uses uuidToId (which removes dashes)
      const normalizedKey = parsePageId(key, { uuid: false }) || key
      if (normalizedKey !== key && normalizedKey.length > 0) {
        sanitizedBlocks[normalizedKey] = blockRecord
      }
    }
  }

  // Sanitize collections similar to blocks - they might also have nested structures
  const sanitizedCollections: typeof recordMap.collection = {}
  if (recordMap.collection) {
    for (const [key, collectionRecord] of Object.entries(
      recordMap.collection
    )) {
      if (!collectionRecord?.value) {
        continue
      }

      // Handle nested value structure for collections too
      const hasNestedValue = !!(collectionRecord.value as any)?.value
      const actualCollection = hasNestedValue
        ? (collectionRecord.value as any).value
        : collectionRecord.value

      // Flatten nested structure if needed
      if (hasNestedValue && actualCollection) {
        const wrapperProps = { ...(collectionRecord.value as any) }
        delete wrapperProps.value
        collectionRecord.value = { ...wrapperProps, ...actualCollection } as any
      }

      sanitizedCollections[key] = collectionRecord
    }
  }

  // Preserve all other recordMap properties (space, etc.)
  return {
    ...recordMap,
    block: sanitizedBlocks,
    collection: sanitizedCollections
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
  // Enable fetchMissingBlocks to ensure all child blocks are fetched with complete data
  // This is important because blocks referenced in content arrays need to have their type property
  // Also enable fetchCollections to ensure collection data (including schema) is fetched
  let recordMap = await notion.getPage(pageId, {
    fetchMissingBlocks: true,
    fetchCollections: true
  })
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

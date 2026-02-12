import { NextApiRequest, NextApiResponse } from 'next'

import { ExtendedRecordMap } from 'notion-types'
import {
  getBlockParentPage,
  getBlockTitle,
  getPageProperty,
  idToUuid
} from 'notion-utils'

import * as config from '@/lib/config'
import { getSiteMap } from '@/lib/get-site-map'
import { getSocialImageUrl } from '@/lib/get-social-image-url'
import { getCanonicalPageUrl } from '@/lib/map-page-url'
import { getSiteUrl } from '@/lib/get-config-value'

type BlogPost = {
  title: string
  description: string
  published: number // unix timestamp
  url: string
  authors: string[]
  coverImage: {
    url: string
    width: number
    height: number
  }
}

type Response = {
  posts: BlogPost[]
}

/**
 * This handler exposes recent blog posts as a JSON object for displaying post
 * previews on the rest of the site.
 */
export default async function (req: NextApiRequest, res: NextApiResponse) {
  const siteUrl = getSiteUrl(req)
  const siteMap = await getSiteMap()
  const ttl = 1 * 60 * 60 // 24 hours
  // const ttl = undefined // disable cache TTL
  const data: Response = {
    posts: []
  }

  const limit = 5

  for (const pagePath of Object.keys(siteMap.canonicalPageMap)) {
    const pageId = siteMap.canonicalPageMap[pagePath]
    const recordMap = siteMap.pageMap[pageId] as ExtendedRecordMap
    if (!recordMap) continue

    const keys = Object.keys(recordMap?.block || {})
    const block = recordMap?.block?.[keys[0]]?.value
    if (!block) continue

    const parentPage = getBlockParentPage(block, recordMap)
    const isBlogPost =
      block.type === 'page' &&
      block.parent_table === 'collection' &&
      parentPage?.id === idToUuid(config.rootNotionPageId)
    if (!isBlogPost) {
      continue
    }

    const isPublished = getPageProperty<number>('Published', block, recordMap)
    if (!isPublished) {
      continue
    }

    const title = getBlockTitle(block, recordMap) || config.name
    const description =
      getPageProperty<string>('Description', block, recordMap) ||
      config.description
    const url = getCanonicalPageUrl(
      {
        ...config.site,
        domain: new URL(siteUrl).host
      },
      recordMap
    )(pageId)
    const socialImageUrl = getSocialImageUrl(pageId)
    const authorList =
      getPageProperty<string>('Authors', block, recordMap) || config.author
    const published = getPageProperty<number>('Date', block, recordMap)

    // By default, social image URLs have a big title in front. We add an extra
    // query parameter to signal that we want to use the image as-is.
    const revisedImageUrl = new URL(socialImageUrl)
    revisedImageUrl.searchParams.set('text', 'false')
    const coverImageUrl = revisedImageUrl.toString()

    data.posts.push({
      title,
      description,
      published,
      coverImage: {
        url: coverImageUrl,
        width: 1200,
        height: 630
      },
      url,
      authors: authorList
        .split(',')
        // Remove any uses of the word "and", along with any extra whitespace.
        .map((s) => s.replace(/\band\b/g, '').trim())
    })
  }

  // Sort posts from newest to oldest.
  data.posts.sort((a, b) => b.published - a.published).slice(0, limit)

  res.setHeader(
    'Cache-Control',
    `s-maxage=${ttl}, stale-while-revalidate=${ttl}`
  )
  res.status(200).json(data)
}

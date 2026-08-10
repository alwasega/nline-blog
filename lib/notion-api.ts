import { NotionAPI } from 'notion-client'

const notionUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL,
  authToken: process.env.NOTION_TOKEN,
  kyOptions: {
    headers: {
      'User-Agent': notionUserAgent
    },
    retry: {
      limit: 5,
      methods: ['get', 'post'],
      statusCodes: [408, 413, 429, 500, 502, 503, 504]
    },
    timeout: 30_000
  }
})

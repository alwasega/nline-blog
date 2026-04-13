import { NotionAPI } from 'notion-client'

export const notion = new NotionAPI({
  apiBaseUrl: process.env.NOTION_API_BASE_URL,
  kyOptions: {
    retry: {
      limit: 5,
      methods: ['get', 'post'],
      statusCodes: [408, 413, 429, 500, 502, 503, 504]
    },
    timeout: 30_000
  }
})

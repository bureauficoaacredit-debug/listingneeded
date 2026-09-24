import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

function readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw) as Record<string, unknown>)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(
  res: import('http').ServerResponse,
  status: number,
  payload: unknown,
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** Dev-only /api/* so Admin works without `vercel dev`. */
function listingNeededApiPlugin(): Plugin {
  return {
    name: 'listingneeded-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''

        if (url === '/api/parse-mls-pdf') {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.end()
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }
          try {
            const { parseMlsCandidates, parseMlsPdfBuffer } = await import(
              // @ts-expect-error plain JS shared with Vercel api/ — no types
              './api/_lib/mlsParse.js'
            )
            const body = await readJsonBody(req)
            if (body.text != null && String(body.text).trim()) {
              const text = String(body.text)
              const drafts = parseMlsCandidates(text)
              sendJson(res, 200, { text, drafts, source: 'text' })
              return
            }
            if (!body.pdfBase64) {
              sendJson(res, 400, { error: 'Send JSON { pdfBase64 } or { text }.' })
              return
            }
            const b64 = String(body.pdfBase64).replace(/^data:application\/pdf;base64,/i, '')
            const buf = Buffer.from(b64, 'base64')
            const { text, drafts } = await parseMlsPdfBuffer(buf)
            sendJson(res, 200, { text, drafts, source: 'pdf' })
          } catch (err) {
            console.error('[vite parse-mls-pdf]', err)
            sendJson(res, 500, {
              error: err instanceof Error ? err.message : 'PDF parse failed',
            })
          }
          return
        }

        if (url === '/api/import-mls-link') {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.end()
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }
          try {
            const { extractSharedLinkUuid, fetchSharedLinkDrafts } = await import(
              // @ts-expect-error plain JS shared with Vercel api/ — no types
              './api/_lib/sharedLinkMls.js'
            )
            const body = await readJsonBody(req)
            const raw = body.url ?? body.link ?? body.sharedLink ?? ''
            const extracted = extractSharedLinkUuid(raw)
            if (extracted.error) {
              sendJson(res, 400, { error: extracted.error })
              return
            }
            const result = await fetchSharedLinkDrafts(extracted.uuid)
            sendJson(res, 200, result)
          } catch (err) {
            console.error('[vite import-mls-link]', err)
            const msg = err instanceof Error ? err.message : 'Shared-link import failed'
            const status = /not found|invalid|must be|Could not find|Paste a/i.test(msg) ? 400 : 502
            sendJson(res, status, { error: msg })
          }
          return
        }

        return next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), listingNeededApiPlugin()],
})

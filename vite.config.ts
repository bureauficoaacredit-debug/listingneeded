import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/** Dev-only /api/parse-mls-pdf so Admin upload works without `vercel dev`. */
function parseMlsPdfApiPlugin(): Plugin {
  return {
    name: 'parse-mls-pdf-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (url !== '/api/parse-mls-pdf') return next()

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          // @ts-expect-error plain JS shared with Vercel api/ — no types
          const { parseMlsCandidates, parseMlsPdfBuffer } = await import('./api/_lib/mlsParse.js')

          const chunks: Buffer[] = []
          await new Promise<void>((resolve, reject) => {
            req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
            req.on('end', () => resolve())
            req.on('error', reject)
          })
          const raw = Buffer.concat(chunks)
          const body = JSON.parse(raw.toString('utf8') || '{}') as {
            pdfBase64?: string
            text?: string
            filename?: string
          }

          if (body.text != null && String(body.text).trim()) {
            const text = String(body.text)
            const drafts = parseMlsCandidates(text)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ text, drafts, source: 'text' }))
            return
          }

          if (!body.pdfBase64) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Send JSON { pdfBase64 } or { text }.' }))
            return
          }

          const b64 = String(body.pdfBase64).replace(/^data:application\/pdf;base64,/i, '')
          const buf = Buffer.from(b64, 'base64')
          const { text, drafts } = await parseMlsPdfBuffer(buf)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ text, drafts, source: 'pdf' }))
        } catch (err) {
          console.error('[vite parse-mls-pdf]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'PDF parse failed',
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), parseMlsPdfApiPlugin()],
})

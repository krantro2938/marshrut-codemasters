import { createFileRoute } from '@tanstack/react-router'

async function proxy(request: Request) {
  const origin = request.headers.get('origin')
  const allowedOrigin = process.env.PUBLIC_ORIGIN || new URL(request.url).origin
  if (origin && origin !== allowedOrigin) return Response.json({ error: 'Недопустимый источник запроса' }, { status: 403 })
  const upstream = process.env.API_URL || 'http://localhost:8080'
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')
  headers.delete('origin')
  const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
  })
  return new Response(response.body, { status: response.status, headers: response.headers })
}

export const Route = createFileRoute('/api/$')({
  server: { handlers: { GET: ({ request }) => proxy(request), POST: ({ request }) => proxy(request) } },
})

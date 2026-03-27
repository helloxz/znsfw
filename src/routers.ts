import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { hello } from './api/url_check'

const router = new Hono()

router.get("/api/hello",hello)

export default router
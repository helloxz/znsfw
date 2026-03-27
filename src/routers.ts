import { Hono } from 'hono'
import { checkUrl, hello } from './api/url_check'

const router = new Hono()

router.get('/api/hello', hello)
router.get('/api/url_check', checkUrl)

export default router

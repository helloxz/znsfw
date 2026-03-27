import { Hono } from 'hono'
import { checkUrl, hello } from './api/url_check'
import { bearerAuth } from 'hono/bearer-auth'

const token:string = process.env.NSFW_TOKEN || '';

const router = new Hono()

if (token) {
  // 有 Token：先验证，再执行逻辑
  router.get('/api/url_check', bearerAuth({ token }), checkUrl);
} else {
  // 无 Token：直接执行逻辑，不验证
  router.get('/api/url_check', checkUrl);
}

export default router

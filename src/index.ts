import { Hono } from 'hono'
import router from './routers'

const app = new Hono()

app.route('/', router)


export default {
  port: 7086,
  fetch: app.fetch,
  idleTimeout: 60
}
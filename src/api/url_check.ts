import type { Context } from 'hono'

export const hello = (c: Context) => {
    return c.json({
        message: 'Hello, World!',
    })
}

export const checkUrl = (c: Context) => {
    
}
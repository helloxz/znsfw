import type { Context } from 'hono'
import * as nsfwjs from 'nsfwjs'
import * as tf from '@tensorflow/tfjs-node'
import sharp from 'sharp'
import { unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// 关闭 sharp 的底层缓存，防止常驻内存无限增长
sharp.cache(false)

// 支持的图片MIME类型
const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/bmp',
    'image/webp',
    'image/gif',
])

// 最大允许的内容长度（10MB）
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024

// 下载超时时间（60秒）
const DOWNLOAD_TIMEOUT_MS = 30_000

// NSFW判定阈值：Hentai或Porn任意一个>=0.8即判定为NSFW
const NSFW_THRESHOLD = 0.65

// 小于此尺寸（宽高都小于）的图片直接放行
const MIN_DIMENSION_SIZE = 64

// 模型输入图像尺寸（InceptionV3为299x299）
const MODEL_INPUT_SIZE = 299

// 请求头中的User-Agent
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

// 临时文件目录
const TEMP_DIR = join(tmpdir(), 'znsfw_temp')

// MIME类型到临时文件扩展名的映射
const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/bmp': '.bmp',
    'image/webp': '.jpg',  // webp转为jpg
    'image/gif': '.gif',
}

// 全局模型单例，避免重复加载
let cachedModel: nsfwjs.NSFWJS | null = null
let modelLoadingPromise: Promise<nsfwjs.NSFWJS> | null = null

/**
 * 校验URL参数是否合法
 * 必须以http://或https://开头
 */
function validateUrlParam(c: Context): { url: string } | null {
    const url = c.req.query('url')
    if (!url) {
        console.error('[url_check] Missing url parameter')
        return null
    }

    try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            console.error(`[url_check] Invalid protocol: ${parsed.protocol}, url: ${url}`)
            return null
        }
        return { url }
    } catch (err) {
        console.error(`[url_check] URL parse failed: ${url}`, err)
        return null
    }
}

/**
 * 通过HEAD请求探测目标URL的MIME类型和内容长度
 * 返回null表示请求失败或不满足条件
 */
async function probeUrl(url: string): Promise<{ mime: string; contentLength: number } | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    try {
        const headRes = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': url,
            },
            signal: controller.signal,
        })

        if (!headRes.ok) {
            console.error(`[url_check] HEAD request failed: ${url}, status: ${headRes.status}`)
            return null
        }

        const contentType = headRes.headers.get('content-type') || ''
        // 取分号前的部分作为MIME类型
        const mime = contentType.split(';')[0].trim().toLowerCase()
        const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10)

        return { mime, contentLength }
    } catch (err) {
        console.error(`[url_check] HEAD request error: ${url}`, err)
        return null
    } finally {
        clearTimeout(timeoutId)
    }
}

/**
 * 校验MIME类型是否在允许列表中
 */
function isAllowedMime(mime: string): boolean {
    return ALLOWED_MIMES.has(mime)
}

/**
 * 校验内容长度是否超过限制
 */
function isOverSizeLimit(contentLength: number): boolean {
    return contentLength > MAX_CONTENT_LENGTH
}

/**
 * 下载URL内容到临时文件
 * 返回临时文件路径，失败返回null
 */
async function downloadToTempFile(url: string, mime: string): Promise<string | null> {
    const ext = MIME_TO_EXT[mime] || '.bin'
    const filename = `${randomUUID()}${ext}`
    const filepath = join(TEMP_DIR, filename)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    const startTime = Date.now()
    console.log(`[url_check] Download started: ${url}, date: ${new Date().toISOString()}`)

    try {
        await mkdir(TEMP_DIR, { recursive: true })

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': url,
            },
            signal: controller.signal,
        })

        if (!res.ok) {
            console.error(`[url_check] GET request failed: ${url}, status: ${res.status}`)
            return null
        }

        const buffer = await res.arrayBuffer()
        await Bun.write(filepath, buffer)
        const endTime = Date.now()
        console.log(`[url_check] Download completed: ${url}, time: ${endTime - startTime}ms, date: ${new Date().toISOString()}`)

        return filepath
    } catch (err) {
        console.error(`[url_check] Download error: ${url}`, err)
        // 下载或写入中途失败，清理残留的临时文件
        try { await unlink(filepath) } catch {}
        return null
    } finally {
        clearTimeout(timeoutId)
    }
}

/**
 * 二次校验：通过文件magic bytes判断真实的MIME类型
 * 防止服务端返回的Content-Type与实际文件内容不一致
 */
async function verifyMimeByContent(filepath: string, originalMime: string): Promise<boolean> {
    try {
        const metadata = await sharp(filepath).metadata()
        const detectedFormat = metadata.format

        if (!detectedFormat) {
            return false
        }

        const formatToMime: Record<string, string> = {
            jpeg: 'image/jpeg',
            jpg: 'image/jpeg',
            png: 'image/png',
            bmp: 'image/bmp',
            webp: 'image/webp',
            gif: 'image/gif',
        }

        const detectedMime = formatToMime[detectedFormat] || ''
        if (!isAllowedMime(detectedMime)) {
            console.error(`[url_check] MIME mismatch: detected=${detectedFormat}(${detectedMime}), original=${originalMime}`)
            return false
        }
        return true
    } catch (err) {
        console.error(`[url_check] Verify MIME error: ${filepath}`, err)
        return false
    }
}

/**
 * 获取图片尺寸
 * 返回null表示获取失败
 */
async function getImageDimensions(filepath: string): Promise<{ width: number; height: number } | null> {
    try {
        const metadata = await sharp(filepath).metadata()
        if (metadata.width && metadata.height) {
            return { width: metadata.width, height: metadata.height }
        }
        return null
    } catch (err) {
        console.error(`[url_check] Get dimensions error: ${filepath}`, err)
        return null
    }
}

/**
 * 提取GIF的中间帧并返回sharp实例
 * 如果不是GIF或提取失败，返回null
 */
async function extractGifMiddleFrame(filepath: string): Promise<sharp.Sharp | null> {
    try {
        const metadata = await sharp(filepath, { animated: true, pages: -1 }).metadata()
        const pages = metadata.pages || 1

        if (pages <= 1) {
            return null
        }

        // 取中间帧
        const middleIndex = Math.floor(pages / 2)

        return sharp(filepath, { animated: true, page: middleIndex, pages: 1 })
    } catch (err) {
        console.error(`[url_check] Extract GIF frame error: ${filepath}`, err)
        return null
    }
}

/**
 * 处理图像：解码、格式转换、缩放
 * 调用方必须在使用完返回的tensor后调用dispose()释放
 */
async function processImageToTensor(filepath: string, mime: string): Promise<tf.Tensor3D> {
    let sharpInstance: sharp.Sharp

    if (mime === 'image/gif') {
        // GIF取中间帧进行处理
        const gifFrame = await extractGifMiddleFrame(filepath)
        sharpInstance = gifFrame ?? sharp(filepath)
    } else {
        sharpInstance = sharp(filepath)
    }

    // 缩放到模型输入尺寸，保持比例居中裁剪，使用PNG避免压缩损失
    const imageBuffer = await sharpInstance
        .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { 
            fit: 'fill',// 1. 强制铺满，不丢失边缘信息
            kernel: 'lanczos3'// 2. 使用高质量重采样算法（Sharp默认也是这个）
        })
        .removeAlpha() // 3. 去掉透明通道，防止透明背景变黑/变白干扰模型
        .png()
        .toBuffer()

    // 将图片buffer解码为Tensor3D
    return tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D
}

/**
 * 加载或获取缓存的NSFW InceptionV3模型
 */
async function getModel(): Promise<nsfwjs.NSFWJS> {
    if (cachedModel) {
        return cachedModel
    }

    // 并发请求复用同一个加载Promise，避免重复加载和重复日志
    if (!modelLoadingPromise) {
        modelLoadingPromise = nsfwjs.load('InceptionV3').then((model) => {
            cachedModel = model
            modelLoadingPromise = null
            return model
        }).catch((err) => {
            console.error('[url_check] Failed to load NSFW model:', err)
            modelLoadingPromise = null
            throw err
        })
    }

    return modelLoadingPromise
}

/**
 * 对图像Tensor进行NSFW分类
 * 调用方负责传入tensor并自行dispose
 */
async function classifyImage(model: nsfwjs.NSFWJS, tensor: tf.Tensor3D) {
    const predictions = await model.classify(tensor)

    // 从预测结果中提取Hentai和Porn的概率
    const hentai = predictions.find(p => p.className === 'Hentai')?.probability || 0
    const porn = predictions.find(p => p.className === 'Porn')?.probability || 0

    // nsfw取Hentai和Porn中的最大值
    const nsfw = Math.max(hentai, porn)
    const sfw = 1 - nsfw
    // Hentai或Porn任意一个>=阈值即判定为NSFW
    const is_nsfw = hentai >= NSFW_THRESHOLD || porn >= NSFW_THRESHOLD

    return {
        sfw: parseFloat(sfw.toFixed(4)),
        nsfw: parseFloat(nsfw.toFixed(4)),
        is_nsfw,
    }
}

/**
 * 清理临时文件（不阻塞主流程）
 */
async function cleanupTempFile(filepath: string) {
    try {
        await unlink(filepath)
    } catch {
        // 忽略清理失败
    }
}

/**
 * NSFW图像识别接口
 * 接收url参数，下载图片并使用InceptionV3模型进行色情图像识别
 */
export const checkUrl = async (c: Context) => {

    // 1. 校验URL参数
    const urlInfo = validateUrlParam(c)
    if (!urlInfo) {
        return c.json({
            code: -1000,
            msg: 'Missing or invalid url parameter, must start with http:// or https://',
            data: null,
        })
    }

    // 2. 通过HEAD请求探测MIME类型和内容长度
    const probe = await probeUrl(urlInfo.url)
    if (!probe) {
        return c.json({
            code: -1000,
            msg: 'Failed to probe the URL',
            data: null,
        })
    }

    // 3. 校验MIME类型是否支持
    if (!isAllowedMime(probe.mime)) {
        return c.json({
            code: -1000,
            msg: `Unsupported image type: ${probe.mime}`,
            data: null,
        })
    }

    // 4. 校验内容长度是否超限
    if (isOverSizeLimit(probe.contentLength)) {
        return c.json({
            code: -1000,
            msg: `Image too large: ${(probe.contentLength / 1024 / 1024).toFixed(2)}MB, max allowed is 10MB`,
            data: null,
        })
    }

    // 5. 下载图片到临时文件
    const tempFile = await downloadToTempFile(urlInfo.url, probe.mime)
    if (!tempFile) {
        return c.json({
            code: -1000,
            msg: 'Failed to download the image',
            data: null,
        })
    }

    let tensor: tf.Tensor3D | null = null

    try {
        // 6. 二次校验MIME类型（通过文件内容判断）
        const mimeValid = await verifyMimeByContent(tempFile, probe.mime)
        if (!mimeValid) {
            return c.json({
                code: -1000,
                msg: 'Downloaded file is not a valid image',
                data: null,
            })
        }

        // 7. 小尺寸图片直接放行
        const dimensions = await getImageDimensions(tempFile)
        if (dimensions && dimensions.width < MIN_DIMENSION_SIZE && dimensions.height < MIN_DIMENSION_SIZE) {
            return c.json({
                code: 200,
                msg: 'success',
                data: {
                    sfw: 1,
                    nsfw: 0,
                    is_nsfw: false,
                },
            })
        }

        // 8. 处理图像：解码、格式转换、缩放为模型输入尺寸
        // tensor创建后如果后续步骤异常，必须在finally中dispose
        tensor = await processImageToTensor(tempFile, probe.mime)

        // 9. 加载模型并进行NSFW分类
        const model = await getModel()
        const result = await classifyImage(model, tensor)

        return c.json({
            code: 200,
            msg: 'success',
            data: result,
        })
    } catch (err) {
        console.error(`[url_check] Processing failed: ${urlInfo.url}`, err)
        return c.json({
            code: -1000,
            msg: `Image processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            data: null,
        })
    } finally {
        // 释放Tensor内存，防止OOM
        if (tensor) {
            tensor.dispose()
        }
        // 清理临时文件
        await cleanupTempFile(tempFile)
    }
}

export const hello = (c: Context) => {
    return c.json({
        message: 'Hello, World!',
    })
}

# ZNSFW

ZNSFW是一个基于 [NSFW JS](https://github.com/infinitered/nsfwjs) 的色情图像识别服务，提供HTTP API调用。

## 技术栈

使用bun + hono.js + nsfwjs + inception_v3开发的色情图像识别项目。

## 路径规范

* 入口：`src/index.ts`
* 路由：`routers.ts`
* API方法：`src/api`

## 部署

使用Docker Compose部署，新建`compose.yaml`写入以下内容：

```yaml
services:
  znsfw:
    container_name: znsfw
    image: helloz/znsfw
    ports:
      - "7086:7086"
    # 环境变量
    environment:
      - NSFW_TOKEN=your token
    restart: always
```

使用`docker compose up -d`启动。

* `NSFW_TOKEN`：生产环境请自行设置请求密钥。

## HTTP调用

```bash
curl -X GET 'http://IP:7086/api/url_check?url=https://s3.bmp.ovh/xxx.png' -H 'Authorization: Bearer token'
```

响应：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "sfw": 0.1131,
    "nsfw": 0.8869,
    "is_nsfw": true
  }
}
```

* code:`200`视为成功，其余状态码均为失败
* msg:消息提示
* data.is_nsfw:`true`判定为色情图像，`false`为非色情图像。


## 其它说明

1. 此项目仅支持HTTP GET调用，如需更多调用方式，请查看我们的另一个项目：[helloxz/nsfw](https://github.com/helloxz/nsfw)
2. 此项目接口兼容Zpic鉴黄识别服务。

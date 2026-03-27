FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# 清理无用文件，压缩镜像体积
RUN \
  # 删除测试文件
  find node_modules -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null; \
  find node_modules -type d -name "testdata" -exec rm -rf {} + 2>/dev/null; \
  find node_modules -name "*.test.*" -delete 2>/dev/null; \
  find node_modules -name "*.spec.*" -delete 2>/dev/null; \
  # 删除 source map 和文档
  find node_modules -name "*.map" -delete 2>/dev/null; \
  find node_modules -name "*.md" -delete 2>/dev/null; \
  find node_modules -name "CHANGELOG*" -delete 2>/dev/null; \
  find node_modules -name "README*" -delete 2>/dev/null; \
  find node_modules -name "LICENSE*" -delete 2>/dev/null; \
  # 删除浏览器端 tensorflow 后端（服务器不需要）
  rm -rf node_modules/@tensorflow/tfjs-backend-webgl; \
  rm -rf node_modules/@tensorflow/tfjs; \
  rm -rf node_modules/@tensorflow/tfjs-data; \
  rm -rf node_modules/@tensorflow/tfjs-backend-wasm; \
  # 删除 tfjs-node 里的无用文件
  rm -rf node_modules/@tensorflow/tfjs-node/scripts; \
  rm -rf node_modules/@tensorflow/tfjs-node/src; \
  rm -rf node_modules/@tensorflow/tfjs-node/deps; \
  rm -rf node_modules/@tensorflow/tfjs-node/python; \
  find node_modules/@tensorflow/tfjs-node -name "*.h" -delete 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "*.cc" -delete 2>/dev/null; \
  true

FROM oven/bun:1

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY tsconfig.json ./

EXPOSE 6086

CMD ["bun", "run", "src/index.ts"]

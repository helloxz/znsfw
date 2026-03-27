FROM oven/bun:slim AS builder

WORKDIR /opt/znsfw
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
  # 删除浏览器端 tensorflow 后端（服务器用不到）
  rm -rf node_modules/@tensorflow/tfjs-backend-webgl; \
  rm -rf node_modules/@tensorflow/tfjs-data; \
  rm -rf node_modules/@tensorflow/tfjs-backend-wasm; \
  # 删除 tfjs-node 中 GPU 相关和无用文件
  rm -rf node_modules/@tensorflow/tfjs-node/deps; \
  rm -rf node_modules/@tensorflow/tfjs-node/scripts; \
  rm -rf node_modules/@tensorflow/tfjs-node/src; \
  rm -rf node_modules/@tensorflow/tfjs-node/python; \
  find node_modules/@tensorflow/tfjs-node/lib -name "*gpu*" -exec rm -rf {} + 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "*.h" -delete 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "*.cc" -delete 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "*.o" -delete 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "*.gyp" -delete 2>/dev/null; \
  find node_modules/@tensorflow/tfjs-node -name "binding.gyp" -delete 2>/dev/null; \
  # 删除 sharp 中不需要的平台二进制（保留当前平台的）
  find node_modules/sharp/vendor -mindepth 2 -maxdepth 2 -type d \
    ! -name "$(uname -m)" -exec rm -rf {} + 2>/dev/null; \
  # 删除 node-pre-gyp 的无用文件
  rm -rf node_modules/@mapbox/node-pre-gyp/lib/util/s3_setup.js; \
  true

FROM oven/bun:slim

WORKDIR /opt/znsfw

COPY --from=builder /opt/znsfw/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY tsconfig.json ./
COPY run.sh ./
RUN chmod +x run.sh

EXPOSE 7086

CMD ["./run.sh"]

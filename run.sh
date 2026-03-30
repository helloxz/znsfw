#!/bin/sh

# TF 强制允许按需增长内存，防止一次性占满
export TF_FORCE_GPU_ALLOW_GROWTH=true
# 禁用 TF GPU 后端，强制使用 CPU
# export TF_CPP_MIN_LOG_LEVEL=1

exec bun run src/index.ts

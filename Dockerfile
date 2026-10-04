# ==============================================================================
# Stage 1: 构建阶段 (Builder)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm 包管理器
RUN npm install -g pnpm@latest

# 依赖清单优先拷贝与缓存
COPY package.json pnpm-lock.yaml* ./

# 安装完整开发依赖 (含 tsup, typescript)
RUN pnpm install --frozen-lockfile || pnpm install

# 拷贝构建所需配置与源码
COPY tsconfig.json tsup.config.ts ./
COPY src ./src

# 执行 tsup 生产单文件编译打包
RUN pnpm build

# ==============================================================================
# Stage 2: 生产运行阶段 (Runner)
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# 生产环境配置与 SSE 默认分流
ENV NODE_ENV=production \
    MCP_S3_TRANSPORT=sse \
    MCP_S3_SERVER_HOST=0.0.0.0 \
    MCP_S3_SERVER_PORT=8000

# 从构建器拷贝单文件打包产物与包清单
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist

# 切换为 Node 官方镜像自带的安全非 root 用户
USER node

# 暴露 HTTP SSE 默认通信端口
EXPOSE 8000

# 容器存活与就绪探针检查 (每 30 秒执行一次)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/health || exit 1

# 启动常驻 MCP 服务进程
CMD ["node", "dist/index.js"]

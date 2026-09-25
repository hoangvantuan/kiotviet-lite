# Build context phải là gốc repo (pnpm workspace):
#   docker build -f apps/api/Dockerfile .
#
# GL-12: nhiều tầng. Tầng build cài đủ dependency để typecheck và bundle ra dist/ (esbuild,
# gộp mã workspace); tầng runtime chỉ có dependency production, chạy `node` bằng user `node`.
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
# Chỉ copy manifest trước để tận dụng layer cache khi source đổi
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
# xlsx bản vá được vendor (không có trên npm), lockfile ghi integrity sha512
COPY apps/api/vendor/ apps/api/vendor/
COPY packages/shared/package.json packages/shared/
COPY packages/notifications/package.json packages/notifications/

# --ignore-scripts: bỏ qua husky prepare (không có .git trong image)
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @kiotviet-lite/api...

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/notifications/ packages/notifications/
COPY apps/api/ apps/api/
RUN pnpm --filter @kiotviet-lite/api run build

# Tách riêng API với chỉ dependency production. Dạng hoisted vì mã workspace đã nằm trong
# bundle, nên các gói npm của nó (grammy, drizzle-orm...) phải tìm được từ node_modules gốc.
RUN pnpm --filter @kiotviet-lite/api deploy --prod --legacy --ignore-scripts \
     --config.node-linker=hoisted /deploy \
  && rm -rf /deploy/dist && cp -r apps/api/dist /deploy/dist

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/dist ./dist
COPY --from=build /deploy/package.json ./package.json
# Thư mục ghi được của user không đặc quyền; bind mount từ host cần cùng chủ sở hữu
# (docker-compose.prod.yml có service `init-permissions` lo việc này).
RUN mkdir -p /app/logs /app/imports \
  && chown node:node /app/logs /app/imports \
  && chmod 700 /app/imports
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]

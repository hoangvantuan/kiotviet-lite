# Build context phải là gốc repo (pnpm workspace):
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Chỉ copy manifest trước để tận dụng layer cache khi source đổi
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/notifications/package.json packages/notifications/

# --ignore-scripts: bỏ qua husky prepare (không có .git trong image)
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @kiotviet-lite/api...

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/notifications/ packages/notifications/
COPY apps/api/ apps/api/

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 3000

# tsconfig.base.json đặt noEmit nên không có dist; chạy thẳng TS bằng tsx
# (đúng cách script dev đang chạy, tsx hỗ trợ tsconfig paths)
CMD ["node_modules/.bin/tsx", "src/index.ts"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/admin-web/package.json apps/admin-web/
COPY apps/portal-web/package.json apps/portal-web/
COPY packages/shared/package.json packages/shared/
COPY packages/rules/package.json packages/rules/
COPY packages/contracts/package.json packages/contracts/
COPY packages/audit/package.json packages/audit/
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY apps/admin-web/ apps/admin-web/
RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=apps/admin-web

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/admin-web/.next/standalone ./
COPY --from=builder /app/apps/admin-web/.next/static apps/admin-web/.next/static/
RUN mkdir -p apps/admin-web/public
EXPOSE 3000
CMD ["node", "apps/admin-web/server.js"]

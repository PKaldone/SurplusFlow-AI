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
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/rules && \
    npm run build --workspace=packages/contracts && \
    npm run build --workspace=packages/audit && \
    npm run build --workspace=apps/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/apps/worker/package.json apps/worker/
COPY --from=builder /app/apps/admin-web/package.json apps/admin-web/
COPY --from=builder /app/apps/portal-web/package.json apps/portal-web/
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/rules/package.json packages/rules/
COPY --from=builder /app/packages/contracts/package.json packages/contracts/
COPY --from=builder /app/packages/audit/package.json packages/audit/
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/apps/api/dist apps/api/dist/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/rules/dist packages/rules/dist/
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist/
COPY --from=builder /app/packages/audit/dist packages/audit/dist/
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]

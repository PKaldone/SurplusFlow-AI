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
COPY apps/portal-web/ apps/portal-web/
RUN cd apps/portal-web && npx next build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/portal-web/.next/standalone ./
COPY --from=builder /app/apps/portal-web/.next/static apps/portal-web/.next/static/
RUN mkdir -p apps/portal-web/public
EXPOSE 3002
CMD ["node", "apps/portal-web/server.js"]

FROM node:20-alpine
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
COPY apps/worker/ apps/worker/
CMD ["npx", "tsx", "apps/worker/src/index.ts"]

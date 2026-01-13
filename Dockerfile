### Stage 1: build client
FROM node:20-alpine AS client-build
WORKDIR /app

COPY package.json yarn.lock ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn install --frozen-lockfile

COPY client ./client
COPY server ./server
COPY scripts ./scripts

RUN yarn workspace client build
RUN node scripts/copyClientBuild.mjs

### Stage 2: production server
FROM node:20-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

COPY package.json yarn.lock ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn install --frozen-lockfile --production=true

COPY server ./server
COPY --from=client-build /app/server/public ./server/public

EXPOSE 8080
ENV PORT=8080

CMD ["yarn","workspace","server","start"]


FROM node:20.19.0-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:20.19.0-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json next-env.d.ts postcss.config.mjs components.json ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY worker ./worker
COPY scripts ./scripts
COPY db ./db
COPY instrumentation.ts .
RUN npm run build

FROM node:20.19.0-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 flowyn && adduser --system --uid 1001 flowyn
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder --chown=flowyn:flowyn /app/.next/standalone ./
COPY --from=builder --chown=flowyn:flowyn /app/.next/static ./.next/static
COPY --from=builder --chown=flowyn:flowyn /app/lib ./lib
COPY --from=builder --chown=flowyn:flowyn /app/worker ./worker
COPY --from=builder --chown=flowyn:flowyn /app/scripts ./scripts
COPY --from=builder --chown=flowyn:flowyn /app/db ./db
COPY --from=builder --chown=flowyn:flowyn /app/tsconfig.json ./tsconfig.json

USER flowyn
EXPOSE 3000
CMD ["node", "server.js"]

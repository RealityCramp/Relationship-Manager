FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/public ./web/public
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "dist/server/server.js"]

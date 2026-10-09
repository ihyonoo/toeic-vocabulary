# devserver 배포 이미지 (docs/design/2026-10-10-devserver-deploy.md)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 의존성이 모두 devDependencies라 빌드에 번들된다
# build/와 package.json("type": "module")만 둔다
FROM node:24-slim
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/vocab.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/build ./build
# 서버 사용자와 같은 uid 1000이라 ./data 바인드 마운트 권한이 맞는다
RUN mkdir data && chown node:node data
USER node
EXPOSE 3000
CMD ["node", "build"]

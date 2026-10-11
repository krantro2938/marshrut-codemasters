FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

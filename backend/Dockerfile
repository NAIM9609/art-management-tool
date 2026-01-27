# Development stage
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "run", "dev"]

# Build stage for production
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Install all dependencies (including devDependencies) for building
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS production

RUN apk --no-cache add ca-certificates curl

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]

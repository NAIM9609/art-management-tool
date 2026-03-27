# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Set development environment
ENV NODE_ENV=development

# Run development server with hot-reload
CMD ["npm", "run", "dev"]

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Set build-time environment variables
# NEXT_PUBLIC_* variables must be set during build, not runtime!
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# BACKEND_URL is needed for next.config.ts rewrites configuration
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}

# Build the application
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# BACKEND_URL is also needed at runtime for server-side rewrites
ARG BACKEND_URL
ENV BACKEND_URL=${BACKEND_URL}

# Copy package.json for runtime dependencies info
COPY --from=builder /app/package.json ./package.json

# Copy standalone output and normalize layout to /app
# Next.js can emit either .next/standalone/server.js or .next/standalone/<app>/server.js.
COPY --from=builder /app/.next/standalone ./standalone
RUN if [ -f /app/standalone/server.js ]; then \
			cp -R /app/standalone/. /app/; \
		elif [ -f /app/standalone/frontend/server.js ]; then \
			cp -R /app/standalone/frontend/. /app/; \
		else \
			echo "Error: unable to locate standalone server.js" >&2; \
			ls -la /app/standalone >&2; \
			exit 1; \
		fi

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]

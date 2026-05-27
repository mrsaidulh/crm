# --- Builder Stage ---
# We use the full Node 20 image to ensure python, gcc, git and all native compilation libraries are available.
# This prevents compilation errors for any third-party dependencies during "npm install" or "npm run build".
FROM node:20 AS builder

WORKDIR /app

# Copy package descriptors first to optimize caching of layer dependencies
COPY package*.json ./

# Install all packages (development and production)
RUN npm install

# Copy all source files
COPY . .

# Run the build (Vite client compilation, backend esbuild transpilation, copy assets)
RUN npm run build

# --- Runner Stage ---
# Lightweight slim container for production run
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy compiled frontend and backend assets from builder
COPY --from=builder /app/dist ./dist

# Copy the lightweight production-package.json so we can install just raw required dependencies
COPY --from=builder /app/production-package.json ./package.json

# Install production-only dependencies in the workspace root (/app/node_modules)
RUN npm install --omit=dev

EXPOSE 3000

# Run the full-stack server from the workspace root dir
CMD ["node", "dist/server.cjs"]

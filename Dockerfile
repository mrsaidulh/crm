# Multi-stage build to keep the production container lightweight and fast
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency mappings
COPY package*.json ./

# Install all dependencies (including devDependencies required for bundling)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the React frontend production bundle and the bundled server.cjs
RUN npm run build

# --- Production Image ---
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy the build artifacts and the production package.json from builder
COPY --from=builder /app/dist ./dist
# Install only production dependencies inside the runner container
RUN npm install --prefix ./dist --omit=dev

EXPOSE 3000

# Start the full-stack system using the bundled production file
CMD ["node", "dist/server.cjs"]

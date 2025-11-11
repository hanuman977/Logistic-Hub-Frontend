# Multi-stage build for React Frontend - Delivery Tracking

# Stage 1: Build the application
FROM node:18-alpine AS builder

# Accept build args and set them as ENV so Vite picks them up
ARG VITE_API_BASE_URL
ARG VITE_OAUTH_AUTH_URL
ARG VITE_OAUTH_TOKEN_URL
ARG VITE_OAUTH_CLIENT_ID
ARG VITE_OAUTH_CLIENT_SECRET
ARG VITE_OAUTH_SCOPES
ARG VITE_OAUTH_REDIRECT_URI
ARG VITE_OAUTH_LOGOUT_REDIRECT
ARG VITE_OAUTH_LOGOUT_URL

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_OAUTH_AUTH_URL=${VITE_OAUTH_AUTH_URL}
ENV VITE_OAUTH_TOKEN_URL=${VITE_OAUTH_TOKEN_URL}
ENV VITE_OAUTH_CLIENT_ID=${VITE_OAUTH_CLIENT_ID}
ENV VITE_OAUTH_CLIENT_SECRET=${VITE_OAUTH_CLIENT_SECRET}
ENV VITE_OAUTH_SCOPES=${VITE_OAUTH_SCOPES}
ENV VITE_OAUTH_REDIRECT_URI=${VITE_OAUTH_REDIRECT_URI}
ENV VITE_OAUTH_LOGOUT_REDIRECT=${VITE_OAUTH_LOGOUT_REDIRECT}
ENV VITE_OAUTH_LOGOUT_URL=${VITE_OAUTH_LOGOUT_URL}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include devDependencies so the build step has Vite/TypeScript/etc.)
RUN npm ci --silent

# Copy source code
COPY . .

# Add an optional ARG to select the environment
ARG BUILD_MODE=production
ENV VITE_BUILD_MODE=$BUILD_MODE

# Use the mode dynamically
RUN npm run build -- --mode $VITE_BUILD_MODE

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
FROM node:22-bookworm-slim

# Keep the renderer's Linux executables in the runtime image, not only a build container.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libreoffice-impress poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/render/project/src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]

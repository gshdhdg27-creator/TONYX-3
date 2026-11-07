FROM node:24-bookworm-slim
WORKDIR /opt/pixel-office
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends git python3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
COPY *.mjs ./
COPY public ./public
ENV PYTHON_BIN=python3 NODE_ENV=production
USER node
CMD ["node","cloud-start.mjs"]

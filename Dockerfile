FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
ENV HOST=0.0.0.0 PORT=4173 NODE_ENV=production
EXPOSE 4173
USER node
CMD ["node", "server/index.mjs"]

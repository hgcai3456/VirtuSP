FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json package-lock.json server.js ./
RUN npm ci --omit=dev
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
ARG VIRTUSP_GIT_SHA
ENV VIRTUSP_GIT_SHA=$VIRTUSP_GIT_SHA HOST=0.0.0.0 PORT=3000 NODE_ENV=production VIRTUSP_DATA_DIR=/app/data/cleanup-recovery
USER node
EXPOSE 3000
CMD ["node", "server.js"]

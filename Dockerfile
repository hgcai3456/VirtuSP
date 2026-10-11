FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY agents ./agents
COPY corpus ./corpus
COPY data ./data
COPY infra/rds/package.json infra/rds/package-lock.json infra/rds/
COPY infra/rds/load-sql.js infra/rds/load-sql.js
COPY infra/rds/sql infra/rds/sql
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod 755 /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /opt/virtusp-data \
  && cp -a data/. /opt/virtusp-data/ \
  && cd infra/rds \
  && npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && chown -R node:node /app /opt/virtusp-data

ENV PORT=3000 \
    NODE_ENV=production \
    HOME=/tmp \
    HOST=0.0.0.0 \
    VIRTUSP_SHARDS=1 \
    VIRTUSP_DB=/app/data/virtusp.sqlite \
    VIRTUSP_SQLITE_JOURNAL=DELETE

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)})"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

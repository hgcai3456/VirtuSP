const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { Client } = require('pg');

const files = ['001_schema.sql', '002_seed.sql'];
const caUrl = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem';
let currentPassword = '';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error('Set ' + name);
  }

  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchCa(dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(caUrl, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('RDS CA bundle download failed with HTTP ' + res.statusCode));

        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (!body.includes('BEGIN CERTIFICATE')) {
          reject(new Error('RDS CA bundle was not a PEM certificate'));

          return;
        }
        fs.writeFileSync(dest, body, { mode: 0o600 });
        resolve(body);
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('RDS CA bundle download timed out')));
    req.on('error', reject);
  });
}

async function rdsCa() {
  if (process.env.PGSSLROOTCERT) {
    return fs.readFileSync(process.env.PGSSLROOTCERT);
  }

  const dest = path.join(os.tmpdir(), 'virtusp-rds-global-bundle.pem');
  if (fs.existsSync(dest)) {
    const cached = fs.readFileSync(dest);
    if (cached.includes('BEGIN CERTIFICATE')) {
      return cached;
    }
  }

  return fetchCa(dest);
}

async function passwordFromSecret(secretId) {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error('Set AWS_REGION to read SECRET_ID');
  }

  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region });
  let last;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      const parsed = JSON.parse(out.SecretString || '{}');
      if (!parsed.password) {
        throw new Error('Database secret has no password field');
      }

      return String(parsed.password);
    } catch (err) {
      last = err;
      const retryable = err.name === 'ResourceNotFoundException' || err.name === 'InvalidRequestException';
      if (!retryable || attempt === 8) {
        throw err;
      }
      console.error('secret not ready, retry ' + attempt);
      await delay(5000);
    }
  }

  throw last;
}

async function masterPassword() {
  if (process.env.PGPASSWORD) {
    return process.env.PGPASSWORD;
  }
  if (process.env.SECRET_ID) {
    return passwordFromSecret(process.env.SECRET_ID);
  }

  throw new Error('Set PGPASSWORD or SECRET_ID');
}

function redact(err, password) {
  const message = String((err && err.message) || err || 'database load failed');
  if (!password) {
    return message;
  }

  return message.split(password).join('[redacted]');
}

async function connect(config) {
  let last;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const client = new Client(config);
    try {
      await client.connect();

      return client;
    } catch (err) {
      last = err;
      try {
        await client.end();
      } catch (endErr) {
        // The failed socket is already closed.
      }
      if (attempt === 8) {
        break;
      }
      console.error('database not ready, retry ' + attempt);
      await delay(5000);
    }
  }

  throw last;
}

async function main() {
  const host = required('PGHOST');
  const user = required('PGUSER');
  const database = required('PGDATABASE');
  const password = await masterPassword();
  currentPassword = password;
  const ca = await rdsCa();

  for (const file of files) {
    const full = path.join(__dirname, 'sql', file);
    if (!fs.existsSync(full)) {
      throw new Error('Missing SQL file ' + file);
    }
  }

  const client = await connect({
    host,
    port: Number(process.env.PGPORT || 5432),
    user,
    password,
    database,
    application_name: 'virtusp-load-sql',
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: true,
      ca,
      servername: host
    }
  });

  try {
    await client.query("SET statement_timeout = '120s'");
    await client.query('BEGIN');
    for (const file of files) {
      const sql = fs.readFileSync(path.join(__dirname, 'sql', file), 'utf8');
      console.log('applying ' + file);
      await client.query(sql);
    }
    await client.query('COMMIT');

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM journals) AS journals,
        (SELECT COUNT(*)::int FROM medical_data) AS medical_data,
        (SELECT COUNT(*)::int FROM reports) AS reports,
        (SELECT COUNT(*)::int FROM conversations) AS conversations,
        (SELECT COUNT(*)::int FROM conversation_turns) AS conversation_turns
    `);
    console.log(JSON.stringify(counts.rows[0]));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error(redact(rollbackErr, password));
    }
    err.message = redact(err, password);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(redact(err, currentPassword || process.env.PGPASSWORD));
  process.exit(1);
});

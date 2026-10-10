const { compose } = require('./patient-service');

async function handlePatient(req, res, db, deps) {
  if (req.method !== 'POST') {
    return deps.send(res, 405, { error: 'Use POST.' });
  }

  const body = await deps.readBody(req);
  if (!body || !String(body.request || '').trim()) {
    return deps.send(res, 400, { error: 'Provide request text.' });
  }

  return deps.send(res, 200, await compose(db, body));
}

module.exports = { handlePatient };

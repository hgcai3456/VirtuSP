const { Then } = require('@cucumber/cucumber');
const ui = require('../support/ui');

Then('the health endpoint reports the service is up', async function () {
  const health = await ui.driver().executeScript(async () => {
    const res = await fetch('/api/health');
    const body = await res.json();

    return { status: res.status, body };
  });
  ui.assert.equal(health.status, 200);
  ui.assert.equal(health.body.ok, true);
  ui.assert.equal(typeof health.body.journals, 'number');
  ui.assert.equal(typeof health.body.medical_data, 'number');
});

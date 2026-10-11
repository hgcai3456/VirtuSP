const { When, Then } = require('@cucumber/cucumber');
const ui = require('../support/ui');

When('the user enters the {string} workspace', async function (role) {
  const label = role === 'Faculty' ? 'Enter faculty workspace' : 'Enter student workspace';
  await ui.clickButton(label);
  await ui.waitForText(role === 'Faculty' ? 'Patient Studio' : 'My assigned assessments');
});

When('the user switches workspace', async function () {
  const buttons = await ui.driver().findElements(ui.By.css('button'));
  for (const button of buttons) {
    const text = await button.getText();
    if (/switch/i.test(text) && await button.isDisplayed()) {
      await ui.clickElement(button);
      await ui.waitForText('Choose your workspace');
      return;
    }
  }
  throw new Error('No workspace switch button is visible');
});

When('the user chooses {string}', async function (title) {
  await ui.clickButton('Select open assessments');
  const button = await ui.driver().findElement(ui.By.xpath(
    '//button[contains(@class,"simulation-choice")][.//span[contains(@class,"choice-title") and normalize-space()=' +
      (title.includes("'") ? '"' + title + '"' : "'" + title + "'") +
    ']]'
  ));
  await ui.clickElement(button);
  await ui.waitForText('Choose a patient');
});

Then('the browser log has no forbidden session response', async function () {
  const entries = await ui.driver().manage().logs().get('browser');
  const forbidden = entries.filter((entry) =>
    /403/.test(entry.message) && /\/api\/session/i.test(entry.message)
  );
  ui.assert.equal(
    forbidden.length,
    0,
    forbidden.map((entry) => entry.message).join('\n')
  );
});

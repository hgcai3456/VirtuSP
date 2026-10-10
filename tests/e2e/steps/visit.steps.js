const { Given, When, Then } = require('@cucumber/cucumber');
const { Select } = require('selenium-webdriver');
const ui = require('../support/ui');

Given('the student has launched {string}', async function (name) {
  await ui.launchPatient(name);
});

When('the student asks {string}', async function (text) {
  await ui.askPatient(text, 'button');
});

When('the student submits {string} with the Enter key', async function (text) {
  await ui.askPatient(text, 'enter');
});

When('the student opens the {string} chart section', async function (section) {
  await ui.openChart(section);
});

When('the student pauses the conversation', async function () {
  await ui.clickButton('Pause');
});

When('the student taps the microphone', async function () {
  await ui.clickButton('Tap to talk');
});

When('the student documents {string}', async function (note) {
  const box = await ui.driver().findElement(ui.By.css('#rn'));
  await ui.clickElement(box);
  await box.clear();
  await box.sendKeys(note);
  await ui.clickButton('Save note');
});

When('the student switches role to {string}', async function (role) {
  const select = await ui.driver().findElement(ui.By.css('#rl'));
  await new Select(select).selectByVisibleText(role);
  await ui.driver().wait(async () => {
    const current = await ui.driver().findElement(ui.By.css('#rl')).getAttribute('value');

    return current === role;
  }, 5000);
});

When('the student adds {string} to the handoff', async function (extra) {
  const box = await ui.driver().findElement(ui.By.css('#sb'));
  await box.sendKeys(extra);
  ui.assert.ok((await box.getAttribute('value')).includes(extra));
});

When('the student adds the care plan item {string}', async function (item) {
  const input = await ui.driver().findElement(ui.By.css('#cp'));
  await input.clear();
  await input.sendKeys(item);
  await ui.clickButton('Add');
  await ui.waitForText(item);
});

When('the student submits the handoff', async function () {
  await ui.clickButton('Submit handoff');
  await ui.waitForText('Submitted:');
});

Then('the transcript shows {string}', async function (text) {
  await ui.driver().wait(async () => {
    const transcript = await ui.driver().findElement(ui.By.css('#tr')).getText();

    return transcript.includes(text);
  }, Number(process.env.E2E_REPLY_TIMEOUT_MS) || 10000);
});

Then('the objective score is {string}', async function (score) {
  await ui.waitForText('Explainable feedback');
  ui.assert.equal(await ui.driver().findElement(ui.By.css('.score-num')).getText(), score);
});

Then('the patient photo points at {string}', async function (src) {
  const actual = await ui.driver().findElement(ui.By.css('#avf img')).getAttribute('src');
  ui.assert.ok(String(actual).endsWith(src), actual);
});

Then('the selected chart section is {string}', async function (section) {
  ui.assert.equal(await ui.driver().findElement(ui.By.css('#tb button.on')).getText(), section);
});

const { Given, When, Then } = require('@cucumber/cucumber');
const runtime = require('../support/runtime');
const ui = require('../support/ui');

Given('the landing page is open', async function () {
  await ui.driver().get(runtime.baseUrl() + '/');
  await ui.waitForText('Practice the difficult conversation');
});

When('the user follows {string}', async function (label) {
  await ui.clickLink(label);
});

When('the user follows the brand home', async function () {
  await ui.clickElement(await ui.driver().findElement(ui.By.css('a.brand')));
  await ui.waitForText('Practice the difficult conversation');
});

When('the user opens the {string} workspace', async function (name) {
  await ui.clickButton(name);
});

When('the window is {int} by {int}', async function (width, height) {
  await ui.driver().manage().window().setRect({ width, height, x: 0, y: 0 });
});

When('the page is reloaded', async function () {
  await ui.driver().navigate().refresh();
  await ui.driver().wait(async () => {
    const ready = await ui.driver().executeScript('return document.readyState');

    return ready === 'complete';
  }, 15000);
});

When('the faculty cycles the theme', async function () {
  await ui.clickElement(await ui.driver().findElement(ui.By.css('#themeBtn')));
});

When('the faculty sets {string} to {string}', async function (label, value) {
  await ui.setField(label, value);
});

When('the faculty sets {string} to:', async function (label, value) {
  await ui.setField(label, value);
});

When('the faculty presses {string}', async function (label) {
  await ui.clickButton(label);
});

When('the faculty cancels reset', async function () {
  await ui.acceptReset(false);
});

When('the faculty confirms reset', async function () {
  await ui.acceptReset(true);
});

When('the faculty picks {string}', async function (name) {
  await ui.pickPatient(name);
});

When('the sample video fails', async function () {
  await ui.driver().executeScript(`
    var vid = document.querySelector('#theater video');
    if (vid) vid.dispatchEvent(new Event('error'));
  `);
});

When('the visitor watches {string}', async function (name) {
  await ui.watchFromRoster(name);
});

When('the faculty watches {string}', async function (name) {
  await ui.watchFromStudio(name);
});

When('the faculty closes the sample conversation', async function () {
  await ui.clickButton('Close');
});

When('the faculty presses Escape', async function () {
  await ui.driver().actions().sendKeys(ui.Key.ESCAPE).perform();
});

When('the faculty clicks the sample backdrop', async function () {
  await ui.driver().actions().move({ x: 8, y: 8, origin: 'viewport' }).click().perform();
});

When('the user opens a sample for an unknown patient', async function () {
  await ui.driver().get(runtime.baseUrl() + '/app.html?watch=nobody');
  await ui.waitForText('Patient Studio');
});

Then('{string} can be watched', async function (name) {
  ui.assert.match(await (await ui.card(name)).getText(), /Watch conversation/);
});

Then('{string} cannot be watched', async function (name) {
  ui.assert.equal((await (await ui.card(name)).getText()).includes('Watch conversation'), false);
});

Then('the sample conversation is closed', async function () {
  await ui.driver().wait(async () => ui.driver().executeScript(`
    var root = document.getElementById('theater');
    return !root || root.hidden || !root.textContent.trim();
  `), 5000);
});

Then('the page shows {string}', async function (text) {
  await ui.waitForText(text);
});

Then('the page does not show {string}', async function (text) {
  ui.assert.equal((await ui.bodyText()).includes(text), false, 'Page unexpectedly showed ' + text);
});

Then('the address contains {string}', async function (fragment) {
  await ui.driver().wait(async () => (await ui.driver().getCurrentUrl()).includes(fragment), 10000);
});

Then('the field {string} is {string}', async function (label, expected) {
  ui.assert.equal(await ui.fieldValue(label), expected);
});

Then('the theme button reads {string}', async function (label) {
  await ui.driver().wait(async () => {
    return (await ui.driver().findElement(ui.By.css('#themeBtn')).getText()) === label;
  }, 5000);
});

Then('the document theme is {string}', async function (theme) {
  const actual = await ui.driver().executeScript(
    'return document.documentElement.getAttribute("data-theme")'
  );
  if (theme === 'auto') {
    ui.assert.equal(actual, null);
  } else {
    ui.assert.equal(actual, theme);
  }
});

Then('the mode chip reads {string}', async function (label) {
  await ui.driver().wait(async () => {
    return (await ui.driver().findElement(ui.By.css('#mode')).getText()) === label;
  }, 5000);
});

Then('the logo image loads', async function () {
  const loaded = await ui.driver().executeScript(`
    const img = document.querySelector('header img');
    return !!(img && img.complete && img.naturalWidth > 0);
  `);
  ui.assert.equal(loaded, true);
});

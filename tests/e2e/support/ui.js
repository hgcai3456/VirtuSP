const { By, until, Key } = require('selenium-webdriver');
const assert = require('node:assert/strict');
const { getDriver } = require('./runtime');

function driver() {
  return getDriver();
}

function xpathLiteral(value) {
  if (!value.includes("'")) {
    return "'" + value + "'";
  }
  if (!value.includes('"')) {
    return '"' + value + '"';
  }

  return 'concat(' + value.split("'").map((part) => "'" + part + "'").join(`, "'", `) + ')';
}

async function bodyText() {
  return driver().findElement(By.css('body')).getText();
}

async function pageText() {
  const rendered = await bodyText();
  const source = await driver().executeScript('return document.body ? document.body.textContent : ""');

  return rendered + '\n' + source;
}

async function waitForText(text, timeout = 15000) {
  try {
    await driver().wait(async () => (await pageText()).includes(text), timeout);
  } catch (err) {
    const textOnPage = await pageText().catch(() => '');
    throw new Error(
      'Timed out waiting for ' + JSON.stringify(text) + '\n' + textOnPage.slice(0, 1800)
    );
  }
}

async function waitForIdle(timeout = 20000) {
  await driver().wait(async () => !(await driver().executeScript('return !!window.__gating')), timeout);
}

async function clickElement(el) {
  await driver().executeScript('arguments[0].scrollIntoView({block:"center"})', el);
  try {
    await el.click();
  } catch (err) {
    if (!/click intercepted|not interactable/i.test(String(err))) {
      throw err;
    }
    await driver().executeScript('arguments[0].click()', el);
  }
}

async function clickButton(label) {
  const buttons = await driver().findElements(By.xpath(
    '//button[normalize-space()=' + xpathLiteral(label) + ']'
  ));
  for (const button of buttons) {
    if (await button.isDisplayed()) {
      await clickElement(button);

      return;
    }
  }
  throw new Error('No visible button named ' + JSON.stringify(label));
}

async function clickLink(label) {
  const link = await driver().findElement(By.linkText(label));
  await clickElement(link);
}

async function findField(label) {
  return driver().findElement(By.xpath(
    '//label[normalize-space()=' + xpathLiteral(label) + ']/following-sibling::input[1]' +
    ' | //label[normalize-space()=' + xpathLiteral(label) + ']/following-sibling::textarea[1]'
  ));
}

async function setField(label, value) {
  const el = await findField(label);
  await clickElement(el);
  await driver().executeScript(
    "arguments[0].focus(); arguments[0].value = arguments[1];" +
    "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));" +
    "arguments[0].dispatchEvent(new Event('change', { bubbles: true }));",
    el,
    value == null ? '' : String(value)
  );
}

async function fieldValue(label) {
  return (await findField(label)).getAttribute('value');
}

async function launchPatient(name) {
  const button = await driver().findElement(By.xpath(
    '//div[contains(@class,"patient-card")][.//b[normalize-space()=' + xpathLiteral(name) + ']]' +
    '//button[normalize-space()="Start visit"]'
  ));
  await clickElement(button);
  await waitForText(name + ',');
  await waitForText('Chart ·');
  assert.match(await bodyText(), /ENC-[A-Z0-9]+ · v\d+/);
}

async function card(name) {
  return driver().findElement(By.xpath(
    '//div[contains(@class,"patient-card")][.//b[normalize-space()=' + xpathLiteral(name) + ']]'
  ));
}

async function watchFromRoster(name) {
  const link = await driver().findElement(By.xpath(
    '//a[contains(@class,"person")][contains(normalize-space(.), ' + xpathLiteral(name) + ')]'
  ));
  await clickElement(link);
  await waitForText('Sample teaching conversation');
}

async function watchFromStudio(name) {
  const button = await driver().findElement(By.xpath(
    '//div[contains(@class,"patient-card")][.//b[normalize-space()=' + xpathLiteral(name) + ']]' +
    '//button[normalize-space()="Watch conversation"]'
  ));
  await clickElement(button);
  await waitForText('Sample teaching conversation');
}

async function pickPatient(name) {
  const button = await driver().findElement(By.xpath(
    '//button[contains(@class,"patient-pick")][.//b[normalize-space()=' + xpathLiteral(name) + ']]'
  ));
  await clickElement(button);
  await waitForText('Patient Studio');
}

async function openChart(section) {
  const button = await driver().findElement(By.xpath(
    '//*[@id="tb"]/button[normalize-space()=' + xpathLiteral(section) + ']'
  ));
  await clickElement(button);
  const selected = await driver().findElement(By.css('#tb button.on')).getText();
  assert.equal(selected, section);
}

async function ensureTypeBox() {
  let input = await driver().findElement(By.css('#q'));
  if (!(await input.isDisplayed())) {
    await clickButton('Type instead');
  }
  input = await driver().findElement(By.css('#q'));
  await driver().wait(until.elementIsVisible(input), 5000);
}

async function askPatient(text, submit) {
  await waitForIdle();
  const before = await driver().executeScript(
    "return document.querySelectorAll('#tr .bubble').length"
  );
  await ensureTypeBox();
  const box = await driver().findElement(By.css('#q'));
  await box.clear();
  if (submit === 'enter') {
    await box.sendKeys(text, Key.ENTER);
  } else {
    await box.sendKeys(text);
    await clickButton('Send');
  }
  try {
    await driver().wait(async () => {
      const gating = await driver().executeScript('return !!window.__gating');
      const count = await driver().executeScript(
        "return document.querySelectorAll('#tr .bubble').length"
      );

      return !gating && count >= before + 2;
    }, 20000);
  } catch (err) {
    const status = await driver().executeScript(
      "var node = document.querySelector('#mst'); return node ? node.textContent : ''"
    );
    throw new Error('Patient did not answer ' + JSON.stringify(text) + '. Status: ' + status);
  }
}

async function acceptReset(accept) {
  try {
    await clickButton('Reset');
  } catch (err) {
    if (!/alert/i.test(String(err))) {
      throw err;
    }
  }
  const alert = await driver().wait(until.alertIsPresent(), 5000);
  assert.match(await alert.getText(), /Reset all saved patients/);
  if (accept) {
    await alert.accept();
    await driver().wait(async () => {
      const name = await driver().executeScript(`
        var label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent.trim() === 'Name');
        var input = label && label.nextElementSibling;
        return input ? input.value : '';
      `).catch(() => '');

      return name === 'Denise Carter';
    }, 15000);
  } else {
    await alert.dismiss();
  }
}

module.exports = {
  By,
  Key,
  until,
  assert,
  driver,
  bodyText,
  waitForText,
  waitForIdle,
  clickElement,
  clickButton,
  clickLink,
  setField,
  fieldValue,
  launchPatient,
  pickPatient,
  card,
  watchFromRoster,
  watchFromStudio,
  openChart,
  askPatient,
  acceptReset
};

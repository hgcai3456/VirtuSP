const fs = require('fs');
const path = require('path');
const { Builder, logging } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromeBinary } = require('./chrome');
const runtime = require('./runtime');

setDefaultTimeout(120000);

const PRELOAD = `
  window.__mute = true;
  window.speechSynthesis = {
    cancel() {},
    getVoices() { return []; },
    speak(utter) { if (utter && typeof utter.onend === 'function') utter.onend(); }
  };
  try {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, get() { return undefined; } });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, get() { return undefined; } });
  } catch (err) {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  }
`;

async function resetWindow() {
  const driver = runtime.getDriver();
  await driver.manage().window().setRect({ width: 1440, height: 1200, x: 0, y: 0 });
}

async function pinLocale(driver) {
  const timezone = process.env.E2E_TIMEZONE || 'UTC';
  const locale = process.env.E2E_LOCALE || 'en-US';
  await driver.sendDevToolsCommand('Emulation.setTimezoneOverride', { timezoneId: timezone });
  try {
    await driver.sendDevToolsCommand('Emulation.setLocaleOverride', { locale });
  } catch (err) {
    // Chrome still starts with --lang when this command is unavailable.
  }
}

BeforeAll(async function () {
  fs.mkdirSync(path.join(runtime.root, 'tests', 'e2e', 'reports'), { recursive: true });
  await runtime.startServer();

  const options = new chrome.Options();
  const binary = chromeBinary();
  if (binary) {
    options.setChromeBinaryPath(binary);
  }
  options.setUserPreferences({ intl: { accept_languages: 'en-US,en' } });
  const logs = new logging.Preferences();
  logs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  options.setLoggingPrefs(logs);
  const args = [
    '--lang=en-US',
    '--accept-lang=en-US,en',
    '--window-size=1440,1200',
    '--disable-gpu',
    '--mute-audio',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-notifications',
    '--disable-popup-blocking'
  ];
  if (process.env.E2E_HEADLESS !== '0') {
    args.unshift('--headless=new');
  }
  options.addArguments(...args);

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  runtime.setDriver(driver);
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 30000 });
  await pinLocale(driver);
  await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD });
});

Before(async function ({ pickle }) {
  const driver = runtime.getDriver();
  await pinLocale(driver);
  await resetWindow();
  await driver.get(runtime.baseUrl() + '/app.html');
  await driver.executeScript('localStorage.clear(); sessionStorage.clear();');
  await driver.navigate().refresh();
  const workspaceEntry = (pickle.tags || []).some((tag) => tag.name === '@session');
  await driver.wait(async () => {
    const heading = await driver.executeScript(
      "var node = document.querySelector('#app h1'); return node ? node.textContent : ''"
    );

    return (
      heading.includes('Patient Studio') ||
      heading.includes('Choose your workspace')
    );
  }, 15000);
  const heading = await driver.executeScript(
    "var node = document.querySelector('#app h1'); return node ? node.textContent : ''"
  );
  if (!workspaceEntry && heading.includes('Choose your workspace')) {
    const ui = require('./ui');
    await ui.clickButton('Enter faculty workspace');
    await ui.waitForText('Patient Studio');
  }
});

After(async function (scenario) {
  const driver = runtime.getDriver();
  try {
    const alert = await driver.switchTo().alert();
    await alert.dismiss();
  } catch (err) {
    // No dialog was left open.
  }
  if (scenario.result && scenario.result.status === Status.FAILED) {
    try {
      const png = await driver.takeScreenshot();
      await this.attach(Buffer.from(png, 'base64'), 'image/png');
    } catch (err) {
      // The browser may already be gone.
    }
  }
  try {
    await resetWindow();
  } catch (err) {
    // Window restore is best-effort between scenarios.
  }
});

AfterAll(async function () {
  try {
    await runtime.getDriver().quit();
  } catch (err) {
    // Browser was not started.
  }
  runtime.setDriver(null);
  await runtime.stopServer();
});

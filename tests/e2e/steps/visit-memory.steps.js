const { Given, When, Then } = require("@cucumber/cucumber");
const { By } = require("selenium-webdriver");
const ui = require("../support/ui");

function driver() {
  return ui.driver();
}

function xpathLiteral(value) {
  if (!value.includes("'")) return "'" + value + "'";
  if (!value.includes('"')) return '"' + value + '"';

  return (
    "concat(" +
    value
      .split("'")
      .map((part) => "'" + part + "'")
      .join(`, "'", `) +
    ")"
  );
}

async function visibleButton(label) {
  const buttons = await driver().findElements(
    By.xpath("//button[normalize-space()=" + xpathLiteral(label) + "]"),
  );
  for (const button of buttons) {
    if (await button.isDisplayed()) return button;
  }
  throw new Error("No visible button named " + JSON.stringify(label));
}

Given("the faculty opens a visit with {string}", async function (name) {
  const button = await driver().findElement(
    By.xpath(
      '//article[contains(@class,"patient-card")][.//h3[normalize-space()=' +
        xpathLiteral(name) +
        ']]//button[normalize-space()="Start visit"]',
    ),
  );
  await ui.clickElement(button);
  await ui.waitForText(name + ",");
  await driver().wait(async () => {
    const boxes = await driver().findElements(By.css("#question"));
    return boxes.length === 1 && (await boxes[0].isEnabled());
  }, 15000);
});

Then("the visit shows a talking portrait for {string}", async function (name) {
  const photo = await driver().findElement(By.css("#avf img.patient-photo"));
  const src = await photo.getAttribute("src");
  ui.assert.ok(String(src).includes("/api/profiles/"), src);
  ui.assert.equal(await photo.getAttribute("alt"), name);
  ui.assert.equal(
    (await driver().findElements(By.css("#patient-call"))).length,
    1,
  );
  ui.assert.equal(
    (await driver().findElements(By.css("#patient-video"))).length,
    1,
  );
});

When("the student sends {string} in the visit", async function (text) {
  const before = await driver().executeScript(
    "return document.querySelectorAll('#transcript .bubble').length",
  );
  const box = await driver().findElement(By.css("#question"));
  await ui.clickElement(box);
  await box.clear();
  await box.sendKeys(text);
  await ui.clickElement(await visibleButton("Send"));
  try {
    await driver().wait(async () => {
      const count = await driver().executeScript(
        "return document.querySelectorAll('#transcript .bubble').length",
      );
      const busy = await driver().executeScript(
        "var node = document.getElementById('question'); return !node || node.disabled;",
      );

      return count >= before + 2 && !busy;
    }, 20000);
  } catch (err) {
    const page = await driver()
      .findElement(By.css("body"))
      .getText()
      .catch(() => "");
    throw new Error(
      "Patient did not answer " + JSON.stringify(text) + "\n" + page.slice(0, 1200),
    );
  }
});

Then("the visit transcript shows {string}", async function (text) {
  await ui.waitForText(text);
  const transcript = await driver().findElement(By.css("#transcript")).getText();
  ui.assert.ok(transcript.includes(text), transcript);
});

Then("the visit transcript does not show {string}", async function (text) {
  const transcript = await driver().findElement(By.css("#transcript")).getText();
  ui.assert.ok(!transcript.includes(text), transcript);
});

When("the portrait stays on screen while the patient speaks", async function () {
  await driver().executeScript(`
    window.speechSynthesis = {
      cancel() {},
      getVoices() { return []; },
      speak(utter) {
        window.__patientUtterance = utter;
        if (utter && typeof utter.onstart === "function") utter.onstart();
      }
    };
  `);
});

Then("the talking portrait is moving", async function () {
  await driver().wait(async () => {
    return driver().executeScript(
      "var frame = document.getElementById('avf'); return !!(frame && frame.classList.contains('video-call') && frame.classList.contains('face-ready'));",
    );
  }, 8000);
  const samples = await driver().executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    const canvas = document.getElementById("patient-call");
    const ctx = canvas.getContext("2d");
    const grab = () => {
      const data = ctx.getImageData(80, 200, 280, 140).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 8) sum += data[i];
      return sum;
    };
    const first = grab();
    setTimeout(() => done([first, grab(), getComputedStyle(canvas).display]), 280);
  `);
  ui.assert.equal(samples[2], "block");
  ui.assert.notEqual(samples[0], samples[1]);
});

const { When, Then } = require("@cucumber/cucumber");
const { By } = require("selenium-webdriver");
const ui = require("../support/ui");

function literal(value) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return (
    "concat(" +
    value
      .split("'")
      .map((part) => `'${part}'`)
      .join(`, "'", `) +
    ")"
  );
}

async function transcriptText() {
  return ui.driver().findElement(By.css("#transcript")).getText();
}

When("the student starts the visit for {string}", async function (name) {
  const button = await ui.driver().findElement(
    By.xpath(
      `//article[contains(@class,"patient-card")][.//h3[normalize-space()=${literal(name)}]]//button[normalize-space()="Start visit"]`,
    ),
  );
  await ui.clickElement(button);
  await ui.waitForText(name + ",");
  const answer = await ui
    .driver()
    .findElement(By.css('[data-action="answer-call"]'));
  await ui.clickElement(answer);
  await ui.driver().wait(async () => {
    const boxes = await ui.driver().findElements(By.css("#question"));
    return boxes.length === 1 && (await boxes[0].isEnabled());
  }, 15000);
});

When("the student asks {string}", async function (text) {
  await ui.driver().wait(async () => {
    const box = await ui.driver().findElement(By.css("#question"));
    return box.isEnabled();
  }, 15000);
  const before = await ui
    .driver()
    .executeScript("return document.querySelectorAll('#transcript .bubble').length");
  const box = await ui.driver().findElement(By.css("#question"));
  await box.clear();
  await box.sendKeys(text);
  const send = await ui.driver().findElement(By.css('#question-form button[type="submit"]'));
  await ui.clickElement(send);
  await ui.driver().wait(async () => {
    const count = await ui
      .driver()
      .executeScript("return document.querySelectorAll('#transcript .bubble').length");
    return count >= before + 2;
  }, 20000);
});

Then("the patient's camera is on", async function () {
  await ui.driver().wait(async () => {
    return ui.driver().executeScript(`
      var frame = document.getElementById("avf");
      var badge = frame && frame.querySelector(".av-live");
      return !!(
        frame &&
        frame.classList.contains("video-call") &&
        badge &&
        badge.textContent.includes("Camera on") &&
        !document.querySelector("[data-action='answer-call']")
      );
    `);
  }, 10000);
});

Then("the text visit status is {string}", async function (status) {
  await ui.driver().wait(async () => {
    const actual = await ui.driver().findElement(By.css("#voice-status")).getText();
    return actual === status;
  }, 10000);
});

Then("the message thread shows {string}", async function (text) {
  await ui.driver().wait(async () => (await transcriptText()).includes(text), 10000);
});

Then("the message thread does not show {string}", async function (text) {
  ui.assert.equal((await transcriptText()).includes(text), false, await transcriptText());
});

Then("the emergency alert says {string}", async function (text) {
  await ui.driver().wait(async () => {
    const alerts = await ui.driver().findElements(By.css(".emergency"));
    if (!alerts.length) return false;
    return (await alerts[0].getText()).includes(text);
  }, 10000);
});

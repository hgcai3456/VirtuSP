const { When, Then } = require('@cucumber/cucumber');
const ui = require('../support/ui');

async function setControl(selector, value) {
  const el = await ui.driver().findElement(ui.By.css(selector));
  await ui.clickElement(el);
  await el.clear();
  if (value) {
    await el.sendKeys(value);
  }
}

When('the faculty waits for the library to load', async function () {
  await ui.waitForText('shard 0');
});

When('the faculty sets the PubMed result limit to {string}', async function (limit) {
  await setControl('.truth-actions input[type="number"]', limit);
  ui.assert.equal(
    await ui.driver().findElement(ui.By.css('.truth-actions input[type="number"]')).getAttribute('value'),
    limit
  );
});

When('the faculty searches grounded facts for {string}', async function (query) {
  await setControl('input[placeholder="Search grounded facts"]', query);
  await ui.clickButton('Search');
});

When('the faculty searches grounded facts for {string} with Enter', async function (query) {
  const el = await ui.driver().findElement(ui.By.css('input[placeholder="Search grounded facts"]'));
  await el.clear();
  await el.sendKeys(query, ui.Key.ENTER);
});

When('the faculty ingests this publication JSON:', async function (json) {
  await setControl('textarea[placeholder*="facts"]', json);
  await ui.clickButton('Ingest JSON');
});

When('the faculty ingests a unique grounded publication', async function () {
  this.token = 'reg' + Date.now().toString(36);
  const quote = 'This grounded regression abstract documents token ' + this.token + ' for faculty review.';
  const publication = {
    title: 'VirtuSP regression ' + this.token,
    authors: 'VirtuSP Faculty',
    journal_name: 'VirtuSP Test',
    year: 2026,
    abstract: quote,
    facts: [{
      claim: 'Token ' + this.token + ' is a grounded regression claim.',
      quote,
      topic: this.token
    }]
  };
  await setControl('textarea[placeholder*="facts"]', JSON.stringify(publication));
  await ui.clickButton('Ingest JSON');
  await ui.waitForText('added 1 grounded fact');
});

Then('a PubMed link for {string} is shown', async function (pmid) {
  const link = await ui.driver().findElement(ui.By.css('a[href*="' + pmid + '"]'));
  ui.assert.match(await link.getAttribute('href'), /pubmed\.ncbi\.nlm\.nih\.gov/);
});

Then('the library lists the unique publication', async function () {
  await ui.waitForText(this.token);
});

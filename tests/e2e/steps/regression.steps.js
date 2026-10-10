const { When, Then } = require('@cucumber/cucumber');
const ui = require('../support/ui');

async function bubbleCount() {
  return ui.driver().executeScript(
    "return document.querySelectorAll('#tr .bubble').length"
  );
}

async function showQuestionBox() {
  const visible = await ui.driver().executeScript(`
    var input = document.querySelector('#q');
    return !!(input && input.offsetParent);
  `);
  if (!visible) {
    await ui.clickButton('Type instead');
  }
}

async function libraryCounts() {
  return ui.driver().executeScript(`
    var chips = Array.from(document.querySelectorAll('.truth-meta .chip')).map((node) => node.textContent);
    var journals = (chips.find((text) => /journals/.test(text)).match(/\\d+/) || [])[0];
    var facts = (chips.find((text) => /medical_data/.test(text)).match(/\\d+/) || [])[0];
    return { journals: Number(journals), facts: Number(facts) };
  `);
}

async function loadSeedAndWait() {
  await ui.driver().executeScript("truth.status = 'pending-regression'");
  await ui.clickButton('Load seed publications');
  await ui.driver().wait(async () => ui.driver().executeScript(`
    return !truth.busy && /added \\d+ grounded fact/.test(truth.status || '');
  `), 20000);
}

When('the faculty loads the seed publications until they are present', async function () {
  const before = await libraryCounts();
  await loadSeedAndWait();
  const afterFirst = await libraryCounts();
  const firstStatus = await ui.driver().executeScript('return truth.status || ""');
  ui.assert.match(firstStatus, /added (0|4) grounded fact/);
  if (before.journals === 0) {
    ui.assert.equal(afterFirst.journals, 4);
    ui.assert.equal(afterFirst.facts, 4);
  } else {
    ui.assert.equal(afterFirst.journals, before.journals);
    ui.assert.equal(afterFirst.facts, before.facts);
  }
  await loadSeedAndWait();
  const secondStatus = await ui.driver().executeScript('return truth.status || ""');
  ui.assert.match(secondStatus, /added 0 grounded fact/);
  ui.assert.deepEqual(await libraryCounts(), afterFirst);
  this.library = afterFirst;
});

When('the faculty clears {string}', async function (label) {
  const cleared = await ui.driver().executeScript((name) => {
    const match = Array.from(document.querySelectorAll('label')).find((node) => node.textContent.trim() === name);
    const input = match && match.nextElementSibling;
    if (!input) {
      return false;
    }
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, label);
  ui.assert.equal(cleared, true);
});

When('the student sends {string}', async function (text) {
  await ui.waitForIdle();
  await showQuestionBox();
  const box = await ui.driver().findElement(ui.By.css('#q'));
  await box.clear();
  if (text) {
    await box.sendKeys(text);
  }
  await ui.clickButton('Send');
  await ui.waitForIdle();
});

When('the student saves a blank note', async function () {
  const box = await ui.driver().findElement(ui.By.css('#rn'));
  await box.clear();
  await ui.clickButton('Save note');
});

When('the student adds a blank care plan item', async function () {
  const input = await ui.driver().findElement(ui.By.css('#cp'));
  await input.clear();
  await ui.clickButton('Add');
});

When('the student clears the handoff', async function () {
  const box = await ui.driver().findElement(ui.By.css('#sb'));
  await ui.clickElement(box);
  await box.clear();
  ui.assert.equal(await box.getAttribute('value'), '');
});

When('the student toggles typing', async function () {
  await ui.clickButton('Type instead');
});

When('the faculty plants an invalid Denise draft', async function () {
  await ui.driver().executeScript(() => {
    const profile = currentProfile();
    profile.facts.push({ id: 'd1', label: 'duplicate', vis: 'ask' });
    profile.facts.push({ id: 'nosay', label: 'no wording', vis: 'ask', src: 'Approved case' });
    profile.facts.push({
      id: 'badlab',
      label: 'lab',
      vis: 'chart',
      sec: 'labs',
      src: 'Approved case',
      lab: true,
      unit: '',
      ref: ''
    });
    profile.facts.push({ id: 'nosec', label: 'chart', vis: 'chart', src: 'Approved case' });
    profile.facts.push({
      id: 'uns',
      label: 'unverified',
      vis: 'ask',
      say: 'I said it.',
      src: 'unverified note'
    });
    profile.facts.push({
      id: 'algx',
      label: 'allergy',
      vis: 'ask',
      say: 'rash',
      src: 'Approved case',
      allergyDrug: 'metformin'
    });
    profile.facts.push({
      id: 'medx',
      label: 'med',
      vis: 'ask',
      say: 'I take metformin.',
      src: 'Approved case',
      drug: 'metformin'
    });
    profile.obj.push({
      id: 'bad',
      t: 'Bad objective',
      w: 5,
      ty: 'fact',
      f: ['missing-fact'],
      tip: 'nope'
    });
    profile.mm = { a: 'missing-a', b: 'missing-b', fu: 'missing-a', kw: ['x'] };
    profile.src = 'Faculty packet';
    writeProfile(profile);
  });
});

When('the saved case data is corrupt', async function () {
  await ui.driver().executeScript("localStorage.setItem('virtusp-v1', '{')");
});

When('the faculty stores the Denise draft under the legacy key as {string}', async function (name) {
  await ui.driver().executeScript((nextName) => {
    const data = {
      drafts: Object.assign({}, drafts),
      rel,
      sel: 'denise',
      tab: 'studio'
    };
    const profile = JSON.parse(data.drafts.denise);
    profile.name = nextName;
    data.drafts.denise = JSON.stringify(profile);
    localStorage.setItem('ptl-v1', JSON.stringify(data));
    localStorage.removeItem('virtusp-v1');
  }, name);
});

When('the faculty points the legacy key at {string}', async function (name) {
  await ui.driver().executeScript((nextName) => {
    const data = JSON.parse(localStorage.getItem('ptl-v1'));
    const profile = JSON.parse(data.drafts.denise);
    profile.name = nextName;
    data.drafts.denise = JSON.stringify(profile);
    localStorage.setItem('ptl-v1', JSON.stringify(data));
  }, name);
});

Then('the ungrounded publication adds a journal and no facts', async function () {
  const counts = await libraryCounts();
  ui.assert.equal(counts.journals, this.library.journals + 1);
  ui.assert.equal(counts.facts, this.library.facts);
  this.library = counts;
});

Then('the chart sections are {string}', async function (list) {
  const actual = await ui.driver().executeScript(
    "return Array.from(document.querySelectorAll('#tb button')).map((button) => button.textContent.trim()).join(', ')"
  );
  ui.assert.equal(actual, list);
});

Then('the transcript has {int} lines', async function (count) {
  ui.assert.equal(await bubbleCount(), count);
});

Then('the selected role is {string}', async function (role) {
  ui.assert.equal(
    await ui.driver().findElement(ui.By.css('#rl')).getAttribute('value'),
    role
  );
});

Then('the handoff includes {string}', async function (text) {
  const value = await ui.driver().findElement(ui.By.css('#sb')).getAttribute('value');
  ui.assert.ok(String(value).includes(text), value);
});

Then('the care plan is empty', async function () {
  const count = await ui.driver().executeScript(
    "return document.querySelectorAll('#app .fx').length"
  );
  ui.assert.equal(count, 0);
});

Then('the question box is visible', async function () {
  const visible = await ui.driver().executeScript(`
    var input = document.querySelector('#q');
    return !!(input && input.offsetParent);
  `);
  ui.assert.equal(visible, true);
});

Then('the question box is hidden', async function () {
  const visible = await ui.driver().executeScript(`
    var input = document.querySelector('#q');
    return !!(input && input.offsetParent);
  `);
  ui.assert.equal(visible, false);
});

Then('the patient photo has loaded', async function () {
  const loaded = await ui.driver().executeScript(`
    var img = document.querySelector('#avf img');
    return !!(img && img.complete && img.naturalWidth > 0);
  `);
  ui.assert.equal(loaded, true);
});

Then('every image on the page has loaded', async function () {
  await ui.driver().wait(async () => ui.driver().executeScript(
    'return Array.from(document.images).every((img) => img.complete)'
  ), 10000);
  const missing = await ui.driver().executeScript(`
    return Array.from(document.images)
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.getAttribute('src') || img.src);
  `);
  ui.assert.deepEqual(missing, []);
});

Then('every patient portrait has loaded', async function () {
  await ui.driver().wait(async () => ui.driver().executeScript(
    "return Array.from(document.querySelectorAll('.patient-card img')).every((img) => img.complete)"
  ), 10000);
  const result = await ui.driver().executeScript(`
    var images = Array.from(document.querySelectorAll('.patient-card img'));
    return {
      count: images.length,
      missing: images.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.getAttribute('src'))
    };
  `);
  ui.assert.ok(result.count >= 10, 'portraits ' + result.count);
  ui.assert.deepEqual(result.missing, []);
});

Then('the released chart images have loaded', async function () {
  await ui.driver().wait(async () => ui.driver().executeScript(`
    var images = Array.from(document.querySelectorAll('.art-img'));
    return images.length === 2 && images.every((img) => img.complete);
  `), 10000);
  const result = await ui.driver().executeScript(`
    var images = Array.from(document.querySelectorAll('.art-img'));
    return {
      count: images.length,
      missing: images.filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.getAttribute('src'))
    };
  `);
  ui.assert.equal(result.count, 2);
  ui.assert.deepEqual(result.missing, []);
});

Then('the sample video source contains {string}', async function (fragment) {
  const src = await ui.driver().executeScript(`
    var video = document.querySelector('#theater video');
    return video ? (video.getAttribute('src') || '') : '';
  `);
  ui.assert.ok(String(src).includes(fragment), src || 'no sample video');
});

Then('these HTTP responses match:', async function (table) {
  for (const row of table.hashes()) {
    const result = await ui.driver().executeScript(async (file) => {
      const res = await fetch(file);
      return {
        status: res.status,
        type: res.headers.get('content-type') || ''
      };
    }, row.path);
    ui.assert.equal(result.status, Number(row.status), row.path + ' status ' + result.status);
    ui.assert.ok(
      result.type.includes(row.type),
      row.path + ' type ' + result.type
    );
  }
});

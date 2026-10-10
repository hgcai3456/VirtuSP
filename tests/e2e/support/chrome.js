const fs = require('fs');
const path = require('path');

function exists(file) {
  try {
    return !!file && fs.existsSync(file);
  } catch (err) {
    return false;
  }
}

function chromeBinary() {
  if (exists(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    );
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(
        process.env.LOCALAPPDATA,
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  return candidates.find(exists) || '';
}

module.exports = {
  chromeBinary
};

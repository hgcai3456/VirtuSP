const shared = {
  require: ['tests/e2e/support/**/*.js', 'tests/e2e/steps/**/*.js'],
  publish: false
};

module.exports = {
  default: {
    ...shared,
    paths: ['tests/e2e/features/**/*.feature'],
    format: ['progress', 'html:tests/e2e/reports/index.html']
  },
  riley: {
    ...shared,
    paths: ['tests/e2e/features/riley-text.feature'],
    format: ['progress', 'html:tests/e2e/reports/riley.html'],
    tags: '@riley'
  }
};

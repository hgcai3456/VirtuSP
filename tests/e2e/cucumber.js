module.exports = {
  default: {
    paths: ['tests/e2e/features/**/*.feature'],
    require: ['tests/e2e/support/**/*.js', 'tests/e2e/steps/**/*.js'],
    format: ['progress', 'html:tests/e2e/reports/index.html'],
    publish: false
  }
};

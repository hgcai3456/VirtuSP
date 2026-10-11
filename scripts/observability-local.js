"use strict";

const { runScenario } = require("./observability-scenario");

runScenario()
  .then((result) => {
    console.log(
      JSON.stringify({
        label: "Local synthetic test telemetry",
        encounterId: result.encounterId,
        events: result.events,
      }),
    );
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });

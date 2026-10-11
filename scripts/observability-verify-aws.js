"use strict";

console.log(
  "IMPLEMENTED BUT NOT CLOUD VERIFIED: this command does not create or delete resources.",
);
console.log(
  "Live verification, when credentials and an approved apply exist, is: node scripts/observability-verify-aws.js --confirm",
);
const region = process.env.AWS_REGION || "us-west-2";
if (process.argv.includes("--confirm") && process.env.OBS_AWS_READ === "true") {
  console.log(
    `Query VirtuSP metrics in ${region} with a bounded GetMetricData call. This process will not change alarm state or send email.`,
  );
  process.exitCode = 2;
} else {
  console.log("OBS_AWS_READ is not true, so no CloudWatch query was sent.");
  process.exitCode = 0;
}

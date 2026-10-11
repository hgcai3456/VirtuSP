"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  talkingVideoResponse,
  sharedAvatarResponse,
} = require("../lib/talking-video-contract");

test("an unavailable talking clip is a successful in-app avatar fallback", () => {
  for (const state of ["pro-required", "failed"]) {
    const response = talkingVideoResponse(state);
    assert.equal(response.http, 200);
    assert.equal(response.body.status, "unavailable");
    assert.equal(response.body.fallback, "in-app-avatar");
    assert.notEqual(response.http, 501);
  }
  assert.equal(talkingVideoResponse("pending").http, 202);
  assert.equal(talkingVideoResponse("ready").video, true);
  const shared = sharedAvatarResponse();
  assert.equal(shared.http, 200);
  assert.equal(shared.body.reason, "shared-avatar");
});

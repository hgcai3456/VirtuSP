"use strict";

// The in-app portrait is the supported avatar. A generated clip is optional.
// Unavailable clips are a successful fallback, not an unimplemented route.
function talkingVideoResponse(state) {
  if (state === "ready") return { http: 200, video: true, body: null };
  if (state === "pro-required" || state === "failed") {
    return {
      http: 200,
      video: false,
      body: {
        status: "unavailable",
        fallback: "in-app-avatar",
        reason: state,
        message:
          "A generated talking clip is not available. The in-app avatar is used.",
      },
    };
  }
  return {
    http: 202,
    video: false,
    body: { status: state === "idle" ? "pending" : state || "pending" },
  };
}

function sharedAvatarResponse() {
  return {
    http: 200,
    video: false,
    body: {
      status: "unavailable",
      fallback: "in-app-avatar",
      reason: "shared-avatar",
      message: "Comparison trials use their shared avatar.",
    },
  };
}

module.exports = { talkingVideoResponse, sharedAvatarResponse };

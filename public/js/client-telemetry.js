"use strict";

// Reports first-party UI failures. It does not send page text, cookies, or
// credentials, and it does not attach trace context to any other host.
(function () {
  let lastRequest = null;
  const original = window.fetch;
  if (typeof original !== "function") return;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const sameOrigin = typeof url === "string" && url.startsWith("/api/");
    return original.call(this, input, init).then((response) => {
      if (sameOrigin && !String(url).includes("/api/client-telemetry")) {
        lastRequest = response.headers.get("X-Request-Id");
        if (!response.ok) report("ui.failed_request", response.status);
      }
      return response;
    });
  };

  function report(eventName, httpStatus) {
    const body = JSON.stringify({
      event_name: eventName,
      outcome: "error",
      http_status: httpStatus || null,
      request_id: lastRequest,
    });
    original.call(window, "/api/client-telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "same-origin",
    }).catch(() => {});
  }

  window.addEventListener("error", () => report("ui.error"));
})();

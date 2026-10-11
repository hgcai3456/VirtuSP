"use strict";

const SECRET =
  /(?:authorization|bearer\s+\S+|aws_secret|aws_access|session_token|api[_-]?key|password|secret|sk-[a-z0-9]|akia[0-9a-z]{16}|x-amz-signature|x-amz-credential)/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PRESIGN = /x-amz-|presign|signature=/i;

function looksSensitive(value) {
  const text = String(value);
  return (
    text.length > 500 ||
    SECRET.test(text) ||
    EMAIL.test(text) ||
    PRESIGN.test(text) ||
    text.includes("\n")
  );
}

function boundedCode(value, fallback = "unlisted") {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  if (!text || looksSensitive(text)) return fallback;
  return text;
}

function errorCode(error) {
  const name = String(error?.name || "");
  const code = String(error?.code || error?.statusCode || "");
  const message = String(error?.message || "");
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    /timeout/i.test(name) ||
    /timeout/i.test(code)
  )
    return "timeout";
  if (
    code === "ThrottlingException" ||
    name === "ThrottlingException" ||
    error?.$metadata?.httpStatusCode === 429 ||
    /throttl/i.test(name) ||
    /throttl/i.test(code)
  )
    return "throttled";
  if (code === "PERSISTENCE_FAILED") return "persistence_failed";
  if (code === "AUDIT_FAILED") return "audit_failed";
  if (
    code === "MODEL_INVALID_JSON" ||
    code === "MODEL_OUTPUT_LIMIT" ||
    code === "MODEL_BLOCKED"
  )
    return "invalid_response";
  if (error?.status === 409) return "conflict";
  if (error?.status === 401 || error?.status === 403) return "unauthorized";
  if (error?.status === 404) return "not_found";
  if (error?.status === 422 || error?.status === 400) return "client_error";
  if (/invalid json|unreadable structured/i.test(message))
    return "invalid_response";
  if (error?.status >= 500) return "error";
  return "error";
}

function providerRequestId(value) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(text)) return null;
  if (looksSensitive(text)) return null;
  return text;
}

function redactText(value) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return "";
  if (looksSensitive(text)) return "[redacted]";
  return text.slice(0, 120);
}

module.exports = {
  looksSensitive,
  boundedCode,
  errorCode,
  providerRequestId,
  redactText,
};

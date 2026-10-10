"use strict";
function cookieClient(getBase) {
  let cookie = "";
  return async (url, options = {}) => {
    const base = typeof getBase === "function" ? getBase() : getBase;
    const response = await fetch(new URL(url, base), {
      ...options,
      headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const next = response.headers.get("set-cookie");
    if (next) cookie = next.split(";")[0];
    return response;
  };
}
async function facultyClient(getBase) {
  const client = cookieClient(getBase);
  const login = () =>
    client("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "faculty" }),
    });
  await login();
  return async (url, options) => {
    let result = await client(url, options);
    if (result.status === 401) {
      await login();
      result = await client(url, options);
    }
    return result;
  };
}
module.exports = { cookieClient, facultyClient };

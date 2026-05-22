export function getExtensionApi() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return chrome;
  }

  if (typeof browser !== 'undefined' && browser.runtime?.id) {
    return browser;
  }

  throw new Error('Browser extension API is not available in this context.');
}

export async function sendRuntimeMessage(message) {
  const extensionApi = getExtensionApi();
  return extensionApi.runtime.sendMessage(message);
}

/**
 * Issue a Nellis HTTPS request from the service worker so every tab shares one
 * queue (avoids parallel extension traffic that can trigger Nellis HTTP 429).
 */
export async function fetchNellisViaBackground(url, init = {}) {
  let headers = init.headers;
  if (headers instanceof Headers) {
    headers = Object.fromEntries(headers.entries());
  } else if (headers && typeof headers === 'object') {
    headers = { ...headers };
  } else {
    headers = {};
  }

  const body =
    init.body === undefined || init.body === null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : String(init.body);

  const result = await sendRuntimeMessage({
    type: 'FETCH_NELLIS',
    url: String(url),
    method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
    headers,
    body,
  });

  if (!result || typeof result !== 'object') {
    throw new Error('Nellis proxy returned an empty response.');
  }
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

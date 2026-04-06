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

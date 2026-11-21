const challengeOrigin = 'https://challenges.cloudflare.com';

export function serveMobileTurnstile(settings) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const key = settings.turnstile_site_key;
  if ((settings.turnstile_enabled !== 'true' && settings.turnstile_login_enabled !== 'true') ||
      typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) {
    return new Response(null, { status: 404, headers });
  }
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Turnstile</title>
<style nonce="${nonce}">:root { color-scheme: light dark; } body { margin: 0; } #widget { display: grid; justify-content: center; }</style>
<script src="${challengeOrigin}/turnstile/v0/api.js?render=explicit" defer></script>
</head>
<body>
<div id="widget"></div>
<script nonce="${nonce}">
if (window.top === window) {
  let started = false;
  window.addEventListener('message', (event) => {
    if (started || !event.isTrusted || event.source !== null ||
        event.data !== 'vpstool-turnstile-v1' || event.ports.length !== 1) return;
    started = true;
    const port = event.ports[0];
    let completed = false;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      port.postMessage(result);
      port.close();
    };
    const fail = () => finish('failed');
    port.postMessage('ready');
    try {
      turnstile.render('#widget', {
        sitekey: ${JSON.stringify(key)},
        size: 'compact',
        retry: 'never',
        'refresh-expired': 'never',
        'refresh-timeout': 'never',
        'response-field': false,
        callback: (token) => finish('token:' + token),
        'error-callback': fail,
        'expired-callback': fail,
        'timeout-callback': fail,
        'unsupported-callback': fail,
      });
    } catch {
      fail();
    }
  });
}
</script>
</body>
</html>`, {
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': [
        "default-src 'none'", `script-src 'nonce-${nonce}' ${challengeOrigin}`,
        `style-src 'nonce-${nonce}'`, `frame-src ${challengeOrigin}`, `connect-src ${challengeOrigin}`,
        "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
      ].join('; '),
    },
  });
}

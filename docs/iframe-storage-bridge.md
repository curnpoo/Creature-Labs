# Iframe Storage Bridge (Parent Page)

Use this on the parent site (`curren.dev`) page that embeds Creature Labs.

It listens for `postMessage` requests from the iframe and reads/writes parent `localStorage`, so saves survive iframe storage restrictions on iOS/Safari.

```html
<script>
  (() => {
    const CHANNEL = 'creaturelabs.storageBridge.v1';
    const ALLOWED_CHILD_ORIGINS = [
      'https://curren.dev',
      'https://www.curren.dev'
      // Add other trusted origins hosting the game iframe, if needed.
    ];

    window.addEventListener('message', (event) => {
      const data = event && event.data;
      if (!data || data.channel !== CHANNEL || data.type !== 'storage:request') return;
      if (!ALLOWED_CHILD_ORIGINS.includes(event.origin)) return;

      const { requestId, action, key, value } = data;
      const respond = (ok, responseValue = null, error = null) => {
        event.source?.postMessage(
          {
            channel: CHANNEL,
            type: 'storage:response',
            requestId,
            ok,
            value: responseValue,
            error
          },
          event.origin
        );
      };

      try {
        if (action === 'get') {
          respond(true, window.localStorage.getItem(String(key)));
          return;
        }
        if (action === 'set') {
          window.localStorage.setItem(String(key), String(value ?? ''));
          respond(true, true);
          return;
        }
        if (action === 'remove') {
          window.localStorage.removeItem(String(key));
          respond(true, true);
          return;
        }
        respond(false, null, 'unsupported-action');
      } catch (error) {
        respond(false, null, error?.message || 'storage-error');
      }
    });
  })();
</script>
```

Recommended iframe:

```html
<iframe
  src="https://YOUR-GAME-URL/creaturelabs/"
  allow="storage-access-by-user-activation"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
></iframe>
```

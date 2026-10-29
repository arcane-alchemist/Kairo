export function createPageLoader(document, window) {
  let current;
  document.querySelector('.loader-retry').addEventListener('click', () => window.location.reload());
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(resolve => window.addEventListener('load', resolve, {once: true}));

  function begin() {
    current?.abort();
    current = new AbortController();
    document.documentElement.setAttribute('data-page-loading', '');
    document.querySelector('#main').setAttribute('aria-busy', 'true');
    document.querySelector('#page-loader').hidden = false;
    return current;
  }

  function settled(node, event, ready, signal) {
    return new Promise(resolve => {
      const done = () => {
        node.removeEventListener(event, done);
        node.removeEventListener('error', done);
        signal.removeEventListener('abort', done);
        resolve();
      };
      node.addEventListener(event, done, {once: true});
      node.addEventListener('error', done, {once: true});
      signal.addEventListener('abort', done, {once: true});
      if (ready() || signal.aborted) done();
    });
  }

  async function finish(ticket, dependencies = []) {
    await Promise.allSettled([loaded, document.fonts?.ready, ...dependencies]);
    if (ticket !== current) return;
    const assets = [...document.querySelectorAll('img, video')].filter(node => !node.closest('[hidden]') && node.loading !== 'lazy' && !['metadata', 'none'].includes(node.getAttribute('preload')) && (node.currentSrc || node.getAttribute('src') || node.querySelector('source[src]')));
    await Promise.allSettled(assets.map(async node => {
      if (node.tagName === 'IMG') {
        node.loading = 'eager';
        await settled(node, 'load', () => node.complete, ticket.signal);
        if (!ticket.signal.aborted && node.naturalWidth && node.decode) await node.decode();
      } else {
        node.preload = 'auto';
        const ready = settled(node, 'loadeddata', () => node.readyState >= 2 || node.error, ticket.signal);
        if (node.readyState < 2 && !node.error) node.load();
        await ready;
      }
    }));
    if (ticket !== current) return;
    document.documentElement.removeAttribute('data-page-loading');
    document.querySelector('#main').setAttribute('aria-busy', 'false');
    document.querySelector('#page-loader').hidden = true;
  }

  return {begin, finish};
}

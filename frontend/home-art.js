// Keep the optional scenes off the startup path and out of non-home routes.
export function mountHomeArt(document, window, loaders = {
  coin: () => import('./scene.js'),
  press: () => import('./press.js')
}) {
  const scenes = [
    ['#coin-stage', 'coin', module => module.mountCoin(document.querySelector('#coin-stage'), document.querySelector('#spin-coin'), document.querySelector('#pause-motion'))],
    ['#press-art', 'press', module => module.mountPress(document.querySelector('#press-art'), document.querySelector('#press-button'), document.querySelector('#press-readout'))]
  ];
  for (const [selector, name, mount] of scenes) {
    const target = document.querySelector(selector);
    if (!target) continue;
    let pending;
    const load = () => pending ||= loaders[name]().then(mount).catch(() => {
      if (name === 'coin') document.querySelector('#spin-coin').hidden = true;
      else {
        document.querySelector('#press-readout').textContent = 'Illustration unavailable';
        document.querySelector('#press-button').hidden = true;
      }
    });
    if (window.IntersectionObserver) {
      const observer = new window.IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
      }, {rootMargin: '200px'});
      observer.observe(target);
    } else {
      const check = () => {
        if (target.closest('[hidden]')) return;
        window.removeEventListener('hashchange', check);
        load();
      };
      window.addEventListener('hashchange', check);
      check();
    }
  }
}

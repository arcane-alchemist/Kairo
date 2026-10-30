// Artwork must initialize independently of API readiness and viewport observers.
export function mountHomeArt(document, window, loaders = {
  coin: () => import('./scene.js'),
  press: () => import('./press-controls.js')
}) {
  const scenes = [
    ['#coin-stage', '#spin-coin', 'coin', module => module.mountCoin(document.querySelector('#coin-stage'), document.querySelector('#spin-coin'), document.querySelector('#pause-motion'))],
    ['#press-art', '#press-button', 'press', module => module.mountPress(document.querySelector('#press-art'), document.querySelector('#press-button'), document.querySelector('#press-readout'))]
  ];
  return Promise.allSettled(scenes.map(([selector, control, name, mount]) => {
    if (!document.querySelector(selector)) return;
    const button = document.querySelector(control), original = button?.innerHTML;
    let pending;
    const load = () => pending ||= loaders[name]().then(mount).then(() => {
      if (button) { button.innerHTML = original; button.onclick = null; }
    }).catch(() => {
      pending = null;
      if (button) {
        button.hidden = false;
        button.textContent = name === 'coin' ? 'Retry 3D coin' : 'Retry memory press';
        button.onclick = load;
      } else {
        document.querySelector(selector).addEventListener('pointerdown', load, {once:true});
        document.querySelector(selector).addEventListener('keydown', load, {once:true});
      }
      if (name === 'press') document.querySelector('#press-readout').textContent = 'Press to retry loading';
    });
    return load();
  }));
}

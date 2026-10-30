export function mountPress(container, button, readout) {
  const down = JSON.parse(container.dataset.pressTravel);
  const head = container.querySelector('#press-head');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let count = 0;
  let currentAnimation = null;
  document.addEventListener('poap-motion', event => { if (event.detail) currentAnimation?.finish(); });
  still.addEventListener('change', () => { if (still.matches) currentAnimation?.finish(); });
  const announce = document.createElement('span');
  announce.setAttribute('role', 'status');
  announce.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  container.append(announce);
  button.addEventListener('click', async () => {
    if (currentAnimation) return;
    button.disabled = true;
    readout.textContent = 'MAKING A LITTLE MEMORY…';
    if (!still.matches && !document.documentElement.classList.contains('motion-paused')) {
      currentAnimation = head.animate([{ transform: 'translate(0px,0px)', offset: 0 }, { transform: `translate(${down[0]}px,${down[1]}px)`, offset: .42 }, { transform: `translate(${down[0]}px,${down[1]}px)`, offset: .62 }, { transform: 'translate(0px,0px)', offset: 1 }], { duration: 1400, easing: 'cubic-bezier(.45,0,.25,1)' });
      try { await currentAnimation.finished; } catch { /* The original geometry remains intact if an animation is interrupted. */ }
    }
    count++;
    readout.textContent = `${String(count).padStart(2, '0')} ${count === 1 ? 'MEMORY' : 'MEMORIES'} PRESSED ♡`;
    announce.textContent = `${count} ${count === 1 ? 'memory' : 'memories'} pressed.`;
    button.disabled = false;
    currentAnimation = null;
  });
}

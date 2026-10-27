const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));

// Description keywords choose the motif; its hash gives each event a stable palette and pattern.
export async function generateBadge(name, description) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${name}\n${description}`)));
  const text = description.toLowerCase();
  const theme = /\b(code|coding|hackathon|software|tech|blockchain|web3|robot|ai)\b/.test(text) ? 'Technology'
    : /\b(music|concert|band|sing|dance|dj)\b/.test(text) ? 'Music'
    : /\b(art|paint|design|creative|exhibition)\b/.test(text) ? 'Arts'
    : /\b(sport|race|run|football|cricket|fitness)\b/.test(text) ? 'Sports' : 'Community';
  const motifs = {
    Technology: '<path d="m215 202-50 54 50 54m82-108 50 54-50 54m-27-124-30 140"/>',
    Music: '<path d="M222 290V180l90-20v110m-90-70 90-20"/><ellipse cx="201" cy="290" rx="21" ry="15"/><ellipse cx="291" cy="270" rx="21" ry="15"/>',
    Arts: '<path d="M310 181c-15 42-48 83-89 111l-28-27c26-43 67-77 117-84Z"/><path d="M215 289c-5 36-28 45-53 34 17-5 4-32 25-40"/>',
    Sports: '<circle cx="256" cy="240" r="62"/><path d="m256 211 28 21-11 32h-34l-11-32 28-21m-1-33v33m60 7-31 14m9 58-20-26m-54 27 20-27m-42-45 31 13M216 324h80"/>',
    Community: '<circle cx="256" cy="221" r="24"/><circle cx="190" cy="239" r="18"/><circle cx="322" cy="239" r="18"/><path d="M213 304v-14a43 43 0 0 1 86 0v14m-136-3v-12a28 28 0 0 1 42-24m143 36v-12a28 28 0 0 0-42-24"/>'
  };
  const hue = hash[0] * 360 / 256;
  const words = name.split(/\s+/); const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if ((lines[last] + ' ' + word).trim().length > 28 && lines[last]) lines.push(word);
    else lines[last] = (lines[last] + ' ' + word).trim();
  }
  const title = lines.slice(0, 4).map((line, index) => `<text x="256" y="${354 + index * 23}" font-size="19">${escape(line.length > 28 ? line.slice(0,25) + '…' : line)}</text>`).join('');
  const dots = Array.from({length: 24}, (_, i) => { const angle = i * Math.PI / 12; const r = 213 + hash[i] % 7; return `<circle cx="${256 + Math.cos(angle)*r}" cy="${256 + Math.sin(angle)*r}" r="2"/>`; }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escape(name)} soulbound attendance badge"><style>.badge-motion{transform-origin:256px 256px;animation:keepsake-turn 8s ease-in-out infinite}@keyframes keepsake-turn{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}@media(prefers-reduced-motion:reduce){.badge-motion{animation:none}}</style><title>${escape(name)}</title><desc>${escape(description)}</desc><g class="badge-motion"><circle cx="256" cy="256" r="252" fill="hsl(${hue} 42% 23%)"/><circle cx="256" cy="256" r="233" fill="none" stroke="hsl(${hue} 65% 78%)" stroke-width="2"/><g fill="hsl(${hue} 65% 78%)">${dots}</g><g fill="none" stroke="hsl(${hue} 65% 78%)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">${motifs[theme]}</g><g fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="700"><text x="256" y="104" font-size="14" letter-spacing="3">KAIRO · ${theme.toUpperCase()}</text><text x="256" y="133" font-size="12" letter-spacing="2">PROOF OF ATTENDANCE</text>${title}<text x="256" y="459" font-size="12" letter-spacing="2">SOULBOUND · SEPOLIA</text></g></g></svg>`;
  return { svg, theme };
}

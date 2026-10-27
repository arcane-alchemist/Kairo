const colors = {
  flower: ['#d0b6ef', '#e0cefa', '#bde366', '#3e2854'],
  planet: ['#f5a482', '#ffcf9e', '#ad9cdd', '#5b3450'],
  sun: ['#cee896', '#e5f2bb', '#ffb97c', '#42503b'],
  eye: ['#f1b6c7', '#f8d5df', '#e7f287', '#63364c'],
  music: ['#b4c9ea', '#dbe5f8', '#ec9fbd', '#34466a'],
  heart: ['#f0d985', '#f9edb7', '#ed967a', '#6b5132']
};

export function motif(kind, ink, accent) {
  const face = `<path d="M143 141v11m34-11v11m-37 12q20 23 41-1" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
  if (kind === 'flower') return `<g fill="${accent}" stroke="${ink}" stroke-width="3.5"><path d="M160 87C143 57 111 73 123 105 91 91 72 119 102 139 67 148 77 181 111 177 91 204 116 227 140 203 144 237 179 235 182 202 208 228 234 203 212 177 245 179 252 145 219 138 247 118 228 90 197 105 207 71 174 57 160 87Z"/></g>${face}`;
  if (kind === 'planet') return `<g stroke="${ink}" stroke-width="4"><circle cx="160" cy="154" r="57" fill="${accent}"/><path d="M101 153c-68 55-24 70 68 25s120-79 48-53" fill="none" stroke-width="12"/><path d="M109 199c27 2 60-12 86-27" fill="none"/><path d="m113 93 2-14m-8 7 14-1m84 126 1-15m-9 8 16-2" stroke-linecap="round"/></g>`;
  if (kind === 'sun') return `<g stroke="${ink}" stroke-width="4" fill="${accent}"><path d="m160 69 13 27 28-14-1 31 31 1-17 27 24 19-29 11 10 29-31-5-5 31-23-21-23 21-5-31-31 5 10-29-29-11 24-19-17-27 31-1-1-31 28 14Z"/></g>${face}`;
  if (kind === 'eye') return `<g stroke="${ink}" stroke-width="4" fill="none"><path d="M79 153q81-100 162 0-81 100-162 0Z" fill="${accent}"/><circle cx="160" cy="153" r="32" fill="${ink}"/><circle cx="169" cy="142" r="10" fill="${accent}" stroke="none"/><path d="m115 103-9-16m54 2V69m45 34 9-16m-99 115-9 16m54-2v20m45-34 9 16" stroke-linecap="round"/></g>`;
  if (kind === 'music') return `<g stroke="${ink}" stroke-width="5" fill="${accent}" stroke-linecap="round" stroke-linejoin="round"><path d="M130 181v-74l77-17v76" fill="none"/><path d="m130 123 77-17" fill="none"/><ellipse cx="115" cy="182" rx="23" ry="16" transform="rotate(-20 115 182)"/><ellipse cx="192" cy="168" rx="23" ry="16" transform="rotate(-20 192 168)"/><path d="M87 107q-12 12-8 26m149 52q10-8 11-19" fill="none"/></g>`;
  return `<path d="M160 209 93 147C46 89 129 59 160 110c31-51 114-21 67 37Z" fill="${accent}" stroke="${ink}" stroke-width="4"/><path d="m133 132-2 10m35-14-2 10m-34 17q19 19 36-3" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
}

export function badgeSvg(kind = 'flower', uid = kind, label = 'GOOD TIMES GROW HERE') {
  kind = Object.hasOwn(colors, kind) ? kind : 'flower';
  uid = String(uid).replace(/[^a-zA-Z\d_-]/g, '-');
  label = String(label).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const [base, light, accent, ink] = colors[kind] || colors.flower;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${kind} collectible artwork"><defs><linearGradient id="${uid}-bg" x2="0.8" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${base}"/></linearGradient><path id="${uid}-top" d="M47 164a113 113 0 0 1 226 0"/><path id="${uid}-bottom" d="M51 164a109 109 0 0 0 218 0"/></defs><circle cx="160" cy="160" r="153" fill="url(#${uid}-bg)" stroke="${ink}" stroke-width="2"/><circle cx="160" cy="160" r="143" fill="none" stroke="${ink}" stroke-width="1"/><circle cx="160" cy="160" r="96" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity=".35"/><g fill="${ink}" font-family="sans-serif" font-weight="700" font-size="14" letter-spacing="3"><text><textPath href="#${uid}-top" startOffset="50%" text-anchor="middle">${label}</textPath></text><text font-size="12" letter-spacing="3.5"><textPath href="#${uid}-bottom" startOffset="50%" text-anchor="middle">POAP · A LITTLE PROOF OF LIFE</textPath></text></g><g fill="${ink}"><path d="m37 152 3 7 7 2-7 3-3 7-2-7-7-3 7-2ZM283 152l3 7 7 2-7 3-3 7-2-7-7-3 7-2Z"/></g>${motif(kind, ink, accent)}</svg>`;
}

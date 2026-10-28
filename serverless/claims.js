const encoder = new TextEncoder();
export async function qrToken(secret, id, seconds = Math.floor(Date.now()/1000)) {
  if (!secret || secret.length < 32) throw Error('QR signing secret is not configured');
  const slot = Math.floor(seconds / 30), message = `${id}.${slot}`;
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)));
  return `${message}.${Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('')}`;
}
export async function validQR(secret, id, token, seconds = Math.floor(Date.now()/1000)) {
  const match = typeof token === 'string' && token.match(/^(\d+)\.(\d+)\.([a-f0-9]{64})$/);
  if (!match || Number(match[1]) !== id || ![Math.floor(seconds/30),Math.floor(seconds/30)-1].includes(Number(match[2]))) return false;
  const expected = await qrToken(secret,id,Number(match[2])*30);
  let difference = expected.length ^ token.length;
  for (let i=0;i<expected.length;i++) difference |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return difference === 0;
}
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''); }
export function csv(rows) {
  return rows.map(row=>row.map(value=>{
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  }).join(',')).join('\r\n');
}
// CSV input is deliberately limited to the two documented columns: email,role.
export function parseRecipients(input) {
  if (!input.trim()) return [];
  const rows=[]; let row=[],cell='',quoted=false;
  for (let i=0;i<input.length;i++) {
    const ch=input[i];
    if (ch==='"') { if (quoted && input[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
    else if (!quoted && (ch===',' || ch==='\n' || ch==='\r')) {
      row.push(cell.trim());cell='';
      if (ch!==',') {if(row.some(Boolean)) rows.push(row);row=[];if(ch==='\r'&&input[i+1]==='\n')i++;}
    } else cell+=ch;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  if(rows[0]?.[0].toLowerCase()==='email' && rows[0]?.[1].toLowerCase()==='role')rows.shift();
  if(rows.some(row=>row.length!==2))throw Error('Use two columns: email,role');
  return rows.map(([email,role])=>({email,role}));
}

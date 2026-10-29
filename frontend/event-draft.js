const key = 'kairo-event-draft';
const fields = ['title', 'club', 'description', 'category', 'campus', 'roles', 'venue', 'starts', 'eventEnds', 'mintStarts', 'ends'];

// Tab-scoped text only: never persist uploaded files, recipient lists or wallet data.
export function preserveEventDraft(form, storage, status) {
  let values = {};
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) values = saved;
  } catch { /* Editing must still work when browser storage is unavailable. */ }
  for (const name of fields) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input && typeof values[name] === 'string') input.value = values[name].slice(0, 1000);
  }
  if (Object.keys(values).length) status.textContent = 'Draft restored in this tab. Reselect uploads or generate your artwork again.';
  function save() {
    const next = {};
    for (const input of form.querySelectorAll('input[name], textarea[name], select[name]')) {
      if (fields.includes(input.name) || /^drops-\d+$/.test(input.name)) next[input.name] = input.value.slice(0, 1000);
    }
    try {
      storage.setItem(key, JSON.stringify(next));
      status.textContent = 'Draft saved in this tab. Uploads must be reselected after leaving.';
    } catch { status.textContent = 'Draft could not be saved in this browser. Keep this tab open to preserve your work.'; }
  }
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  return {
    values,
    clear() { try { storage?.removeItem(key); } catch { /* No saved draft to clear. */ } }
  };
}

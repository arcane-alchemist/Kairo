export function claimEntry(url) {
  const value = url.searchParams.get('drop') || url.hash.match(/^#drop\/([1-9]\d*)$/)?.[1];
  const id = Number(value);
  return /^[1-9]\d*$/.test(value || '') && Number.isSafeInteger(id) ? id : null;
}

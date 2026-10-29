const setupErrors = new Set(['CONTRACT_MISMATCH','RELAYER_MISMATCH','RELAYER_UNFUNDED','RELAYER_NOT_CONFIGURED','MEDIA_NOT_CONFIGURED','MEDIA_UNREACHABLE','MEDIA_MISMATCH','NOT_CONFIGURED']);
export function uncertainPublication(error) {
  return (!error.status || error.status >= 500 || error.code === 'INVALID_RESPONSE') && !setupErrors.has(error.code);
}

// Only this idempotent endpoint may retry a write, always with the original ID.
export async function submitPublication(api, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await api('/organizer/events', {method:'POST',body:JSON.stringify(payload),timeoutMs:45000}); }
    catch (error) {
      if (!uncertainPublication(error)) throw error;
      try { return await api(`/publications/${payload.id}`, {quiet:true}); }
      catch (statusError) {
        if (statusError.status === 404 && attempt === 0) continue;
        if (statusError.status === 401 || statusError.status === 403) throw statusError;
        throw error;
      }
    }
  }
}

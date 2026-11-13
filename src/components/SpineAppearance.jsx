import { useCallback, useState, useSyncExternalStore } from 'react';
import { coverRect, isSpinePhotoUrl } from '../lib/spinePhoto';

const prefix = 'hushthorn:spine:';
const changeEvent = 'hushthorn-spine-change';

function usePreference(id) {
  const key = id == null ? null : prefix + id;
  const subscribe = useCallback(notify => {
    const local = e => { if (e.detail === key) notify(); };
    const storage = e => { if (e.key === key || e.key === null) notify(); };
    window.addEventListener(changeEvent, local);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(changeEvent, local); window.removeEventListener('storage', storage); };
  }, [key]);
  const snapshot = useCallback(() => {
    try { return key && localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot);
  let pref = {};
  try { pref = JSON.parse(raw) || {}; } catch { /* use the custom spine */ }
  return [pref, value => {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: key }));
  }];
}

function spineMode(pref) {
  return pref.actual === true && pref.photo ? 'photo' : 'custom';
}

export function useShelfSpine(id) {
  const [pref] = usePreference(id);
  return { mode: spineMode(pref), photo: pref.actual && isSpinePhotoUrl(pref.photo) ? pref.photo : null };
}

export default function SpineAppearance({ id }) {
  const [pref, save] = usePreference(id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function choose(value) {
    try { save(value); setError(''); }
    catch { setError('Could not save this spine. Check available browser storage and try again.'); }
  }
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // Browsers apply EXIF orientation to decoded <img>, so naturalWidth/Height are upright.
      const horizontal = img.naturalWidth > img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = 84; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      // A horizontal photo is turned 90deg clockwise so its text runs down the spine.
      const [dw, dh] = horizontal ? [canvas.height, canvas.width] : [canvas.width, canvas.height];
      const crop = coverRect(img.naturalWidth, img.naturalHeight, dw, dh);
      if (!crop) throw new Error('empty image');
      if (horizontal) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
      // Safari cannot encode WebP and silently returns PNG, so fall back to JPEG.
      let photo = canvas.toDataURL('image/webp', .88);
      if (!isSpinePhotoUrl(photo)) photo = canvas.toDataURL('image/jpeg', .88);
      if (!isSpinePhotoUrl(photo)) throw new Error('encode failed');
      choose({ actual: true, photo });
    } catch { setError('Could not read that image. Try a JPEG, PNG, or WebP photo.'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <fieldset disabled={busy} className="mt-3 space-y-2 text-sm">
    <legend className="ht-display text-purple-200">Shelf spine</legend>
    <label className="block"><input type="radio" name={'spine-'+id} checked={spineMode(pref) === 'custom'} onChange={() => choose({ ...pref, actual: false })}/> Custom Hushthorn spine</label>
    {pref.photo && <label className="block"><input type="radio" name={'spine-'+id} checked={!!pref.actual} onChange={() => choose({ ...pref, actual: true })}/> Actual spine photo</label>}
    <label className="block">{pref.photo ? 'Replace spine photo' : 'Use an actual spine photo'}
      <input type="file" accept="image/*" className="block w-full text-xs" onChange={e => { const file=e.target.files?.[0]; e.target.value=''; upload(file); }}/>
    </label>
    <p className="text-xs text-purple-300">Upload a photo cropped to the spine. Saved in this browser.</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}

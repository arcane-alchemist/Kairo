import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {preserveEventDraft} from './event-draft.js';

function editor() {
  return parseHTML('<form><input name="title"><textarea name="description"></textarea><input name="roles" value="Attendee"><input name="drops-0" value="50"><input name="artwork" type="file"><input name="wallet"><p role="status"></p></form>').document.querySelector('form');
}
const storage = () => {
  const rows = new Map();
  return {getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
};

test('an editor draft restores text and caps across navigation without storing files or wallet data', () => {
  const store = storage(), form = editor();
  const draft = preserveEventDraft(form, store, form.querySelector('p'));
  form.querySelector('[name="title"]').value='Campus workshop';
  form.querySelector('textarea').value='Our next gathering';
  form.querySelector('[name="drops-0"]').value='75';
  form.querySelector('[name="artwork"]').value='private-file.png';
  form.querySelector('[name="wallet"]').value='private-wallet';
  form.dispatchEvent(new (form.ownerDocument.defaultView.Event)('input'));
  const next = editor();
  const restored = preserveEventDraft(next, store, next.querySelector('p'));
  assert.equal(next.querySelector('[name="title"]').value,'Campus workshop');
  assert.equal(next.querySelector('textarea').value,'Our next gathering');
  assert.equal(restored.values['drops-0'],'75');
  assert.equal(restored.values.artwork,undefined); assert.equal(restored.values.wallet,undefined);
  assert.match(next.querySelector('p').textContent,/Reselect uploads/);
  draft.clear();
  const fresh=editor();preserveEventDraft(fresh,store,fresh.querySelector('p'));
  assert.equal(fresh.querySelector('[name="title"]').value,'');
});

test('disabled storage and corrupt drafts never prevent editing', () => {
  for (const saved of ['broken','[]','{"title":null,"description":42}']) {
    const form=editor();
    preserveEventDraft(form,{getItem:()=>saved,setItem(){throw Error('Storage blocked');}},form.querySelector('p'));
    form.querySelector('[name="title"]').value='Still editable';
    form.dispatchEvent(new (form.ownerDocument.defaultView.Event)('change'));
    assert.equal(form.querySelector('[name="title"]').value,'Still editable');
    assert.match(form.querySelector('p').textContent,/could not be saved/);
  }
});

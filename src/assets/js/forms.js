// Proposal and RFP forms: the designed inline errors, upload panel and sending / sent / failed
// states. Copy comes from data-msg-* attributes in the page. Without this script the forms keep
// native validation and submit normally. See docs/CONVENTIONS.md (Forms).
const NEXT = 'ThankYou.html';

for (const form of document.querySelectorAll('form[data-form]')) enhance(form);

function enhance(form) {
  form.noValidate = true;
  const fields = [...form.elements].filter(el => el.willValidate && !el.closest('[aria-hidden="true"]'));
  const submit = form.querySelector('[type="submit"]');
  const label = submit.innerHTML;
  const live = el('div', 'visually-hidden', { role: 'status' });
  const sent = banner('success', '✓', 'status');
  const failed = banner('error', '!', 'alert');
  form.append(live);
  submit.before(sent, failed);
  let attempted = false, busy = false;

  for (const field of fields) {
    const recheck = () => (attempted || field.hasAttribute('aria-invalid')) && check(field);
    field.addEventListener('input', recheck);
    field.addEventListener('change', recheck);
  }
  for (const input of form.querySelectorAll('input[type="file"]')) upload(input);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    attempted = true;
    const invalid = fields.filter(field => !check(field));
    if (invalid.length) {
      invalid[0].focus();
      announce(invalid.length === 1 ? '1 field needs attention.' : `${invalid.length} fields need attention.`);
      return;
    }
    setBusy(true);
    failed.hidden = true;
    // Dev builds have no endpoint: the form goes straight to the thank-you page.
    if (form.method !== 'post') return form.submit();
    try {
      const response = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status);
      show(sent, form.dataset.msgSent);
      setTimeout(() => location.assign(NEXT), 1200);
    } catch {
      setBusy(false);
      show(failed, form.dataset.msgFailed);
    }
  });

  function setBusy(on) {
    busy = on;
    submit.toggleAttribute('aria-busy', on);
    submit.setAttribute('aria-disabled', String(on));
    submit.innerHTML = on ? '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>' : label;
    if (on) submit.append(form.dataset.msgSending);
    announce(on ? form.dataset.msgSending : '');
  }

  function announce(text) {
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = text; });
  }
}

// Shows the field's designed message, or clears it. Returns whether the field is valid.
function check(field) {
  const v = field.validity, d = field.dataset;
  const message = v.customError ? field.validationMessage
    : v.valueMissing ? d.msgRequired
    : v.valid ? '' : d.msgFormat || d.msgRequired;
  setError(field, message);
  return !message;
}

function setError(field, message) {
  const id = `${field.form.id}-${field.name}-error`;
  let error = document.getElementById(id);
  const ids = (field.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== id);
  if (!message) {
    error?.remove();
    field.removeAttribute('aria-invalid');
    ids.length ? field.setAttribute('aria-describedby', ids.join(' ')) : field.removeAttribute('aria-describedby');
    return;
  }
  if (!error) {
    // Inside the label so it sits under the field; aria-hidden keeps it out of the field's
    // name, and aria-describedby still reads it.
    error = el('span', 'field-error', { id, 'aria-hidden': 'true' });
    field.closest('label').append(error);
  }
  error.replaceChildren(el('span', 'field-error__text', {}, message));
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', [...ids, id].join(' '));
}

// RFP upload: checks type and size, then swaps the picker for the attached-file row.
function upload(input) {
  const panel = input.closest('.upload');
  const picker = input.closest('label');
  const types = input.accept.split(',');
  const maxBytes = Number(input.dataset.maxMb) * 1024 * 1024;
  const name = el('strong');
  const size = el('span');
  const remove = el('button', 'upload__remove hit', { type: 'button' }, 'Remove');
  const row = el('div', 'upload__file', { hidden: '' });
  row.append(el('span', 'upload__name', {}, name, ' · ', size), remove);
  panel.append(row);
  // The row above reports the chosen file, so hide the browser's own "No file chosen" text.
  input.classList.add('input-file--enhanced');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const problem = !types.includes(ext) ? input.dataset.msgType
      : file.size > maxBytes ? input.dataset.msgSize : '';
    if (problem) {
      input.value = '';
      return setError(input, problem);
    }
    setError(input, '');
    name.textContent = file.name;
    size.textContent = formatSize(file.size);
    picker.hidden = true;
    row.hidden = false;
    panel.classList.add('upload--attached');
    remove.focus();
  });

  remove.addEventListener('click', () => {
    input.value = '';
    row.hidden = true;
    picker.hidden = false;
    panel.classList.remove('upload--attached');
    input.focus();
  });
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function banner(tone, icon, role) {
  const box = el('div', `form-alert form-alert--${tone}`, { role, hidden: '' });
  box.append(el('span', 'form-alert__icon', { 'aria-hidden': 'true' }, icon), el('span', 'form-alert__text'));
  return box;
}

function show(box, text) {
  box.hidden = false;
  requestAnimationFrame(() => { box.lastChild.textContent = text; });
}

function el(tag, className, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

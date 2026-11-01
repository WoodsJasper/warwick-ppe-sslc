import { submitFeedback, generateReference } from './submit.js';

const form = document.querySelector('#feedback-form');
const steps = [...document.querySelectorAll('.form-step')];
const markers = [...document.querySelectorAll('.form-progress li')];
const title = document.querySelector('#form-title');
const next = document.querySelector('#next-button');
const back = document.querySelector('#back-button');
const error = document.querySelector('#form-error');
let step = 0;
let busy = false;
let reference = '';
let lastPayload = '';

function showStep(index, focus = true) {
  step = index;
  steps.forEach((section, i) => { section.hidden = i !== step; });
  markers.forEach((marker, i) => {
    marker.toggleAttribute('aria-current', i === step);
    if (i === step) marker.setAttribute('aria-current', 'step');
    marker.classList.toggle('complete', i < step);
  });
  title.textContent = ['Course feedback', 'Feedback details', 'Contact details'][step];
  next.firstElementChild.textContent = ['Continue', 'Continue', 'Send feedback'][step];
  document.querySelector('#step-count').textContent = `0${step + 1} / 03`;
  back.hidden = step === 0;
  error.hidden = true;
  document.querySelector('.form-body').scrollTop = 0;
  if (focus) title.focus({ preventScroll: true });
}
function validStep(index) {
  for (const field of steps[index].querySelectorAll('input, select, textarea')) {
    if (field.type !== 'checkbox') {
      const trimmedLength = field.value.trim().length;
      field.setCustomValidity(field.required && field.minLength > 0 && trimmedLength < field.minLength ? `Please enter at least ${field.minLength} characters.` : '');
    }
    if (!field.checkValidity()) {
      if (step !== index) showStep(index, false);
      field.reportValidity();
      return false;
    }
  }
  return true;
}
form.addEventListener('input', (event) => {
  if ('setCustomValidity' in event.target) event.target.setCustomValidity('');
});
back.addEventListener('click', () => { if (!busy) showStep(Math.max(0, step - 1)); });
document.querySelector('#details').addEventListener('input', (event) => {
  document.querySelector('#character-count').textContent = `${event.target.value.length.toLocaleString('en-GB')} / 5,000`;
});
for (const note of document.querySelectorAll('[data-topic]')) {
  note.addEventListener('click', () => {
    if (busy) return;
    if (form.hidden) return;
    document.querySelector('#topic').value = note.dataset.topic;
    showStep(0, false);
    form.elements.year.focus({ preventScroll: true });
  });
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !validStep(step)) return;
  if (step < 2) { showStep(step + 1); return; }
  for (let index = 0; index < steps.length; index++) if (!validStep(index)) return;
  const data = new FormData(form);
  const fields = Object.fromEntries(data);
  fields.consent = data.get('consent') === 'on';
  const serialized = JSON.stringify(fields);
  if (serialized !== lastPayload) { reference = generateReference(); lastPayload = serialized; }
  busy = true;
  steps.forEach(section => { section.disabled = true; });
  next.disabled = true;
  back.disabled = true;
  next.firstElementChild.textContent = 'Sending feedback…';
  form.setAttribute('aria-busy', 'true');
  error.hidden = true;
  try {
    const result = await submitFeedback(fields, reference);
    document.querySelector('#receipt-reference').textContent = result.reference;
    document.querySelector('#reply-note').textContent = fields.email?.trim() ? 'Your email is included so reps can get back to you. Keep this reference for any follow-up.' : 'You haven’t left an email, so reps can’t reply directly. Keep this reference for any follow-up.';
    form.hidden = true;
    const success = document.querySelector('#success');
    success.hidden = false;
    success.focus({ preventScroll: true });
  } catch (failure) {
    error.textContent = failure.message || 'Your feedback could not be sent. Your details are still here.';
    error.hidden = false;
    error.scrollIntoView({ block: 'nearest' });
  } finally {
    busy = false;
    steps.forEach(section => { section.disabled = false; });
    next.disabled = false;
    back.disabled = false;
    form.removeAttribute('aria-busy');
    next.firstElementChild.textContent = 'Send feedback';
  }
});
document.querySelector('#another-note').addEventListener('click', () => {
  form.reset(); reference = ''; lastPayload = '';
  document.querySelector('#character-count').textContent = '0 / 5,000';
  document.querySelector('#copy-reference').textContent = 'Copy reference';
  document.querySelector('#success').hidden = true;
  form.hidden = false;
  showStep(0);
});
document.querySelector('#copy-reference').addEventListener('click', async (event) => {
  try { await navigator.clipboard.writeText(reference); event.target.textContent = 'Copied!'; }
  catch { event.target.textContent = 'Please select and copy the reference above'; }
});
for (const trigger of document.querySelectorAll('[data-dialog]')) {
  trigger.addEventListener('click', () => document.getElementById(trigger.dataset.dialog).showModal());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
}

// Use the visible phone viewport so the keyboard cannot cover the form actions.
const phoneLayout = window.matchMedia('(max-width: 1100px), (pointer: coarse)');
function fitPhoneViewport() {
  const viewport = window.visualViewport;
  if (!phoneLayout.matches || !viewport) {
    document.body.style.removeProperty('--app-height');
    document.body.classList.remove('keyboard-open');
    return;
  }
  // Preserve pinch zoom rather than rebuilding the layout while a reader magnifies it.
  if (viewport.scale > 1.05) return;
  document.body.style.setProperty('--app-height', `${viewport.height}px`);
  const editing = document.activeElement?.matches('input, textarea, select');
  document.body.classList.toggle('keyboard-open', Boolean(editing && viewport.height < window.innerHeight * 0.8));
}
window.visualViewport?.addEventListener('resize', fitPhoneViewport);
window.addEventListener('resize', fitPhoneViewport);
document.addEventListener('focusin', fitPhoneViewport);
document.addEventListener('focusout', () => requestAnimationFrame(fitPhoneViewport));
fitPhoneViewport();

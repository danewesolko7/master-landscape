// Services dropdown: CSS opens it on hover and focus. This adds the ARIA state
// and lets Escape close it until the pointer or focus leaves. Works without this script.
for (const dropdown of document.querySelectorAll('.dropdown')) {
  const trigger = dropdown.querySelector('.nav-link');
  const panel = dropdown.querySelector('.dropdown__panel');
  const sync = () => requestAnimationFrame(() =>
    trigger.setAttribute('aria-expanded', String(getComputedStyle(panel).display !== 'none')));
  const undismiss = () => { dropdown.classList.remove('is-dismissed'); sync(); };

  sync();
  dropdown.addEventListener('mouseenter', sync);
  dropdown.addEventListener('focusin', sync);
  dropdown.addEventListener('mouseleave', undismiss);
  dropdown.addEventListener('focusout', event => {
    if (!dropdown.contains(event.relatedTarget)) undismiss();
  });
  dropdown.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdown.classList.add('is-dismissed');
    trigger.focus();
    sync();
  });
}

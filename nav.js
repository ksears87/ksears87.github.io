// Shared nav/interaction script, loaded on every page.
//
// The crumple page transition (crumple-transition.js) runs in seamless "swap"
// mode: it replaces the contents of `.site-wrap` with the next page's contents
// in place, without reloading the document — so this script runs only once for
// the life of the tab. Everything here is therefore written to survive a swap:
// behaviors are bound by delegation on `document`/`window` (which persist), and
// anything tied to the swapped-in DOM (the scroll-spy observer) is re-run when
// crumple-transition.js dispatches a `crumple:swapped` event.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // easeInOutCubic — gentle acceleration in, gentle deceleration out.
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Query live each time, because after a swap the nav element is a new node.
  const navOffset = () => {
    const nav = document.querySelector('nav');
    return nav ? nav.offsetHeight + 12 : 0;
  };
  const closeDropdowns = () =>
    document.querySelectorAll('details.nav-dropdown[open]')
      .forEach(d => d.removeAttribute('open'));

  // ── Close nav dropdowns on outside-click / Escape / item-click ──
  // Delegated so it keeps working after the content swaps in a new nav.
  document.addEventListener('click', e => {
    document.querySelectorAll('details.nav-dropdown[open]').forEach(d => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
    const item = e.target.closest('details.nav-dropdown a');
    if (item) {
      const d = item.closest('details.nav-dropdown');
      if (d) d.removeAttribute('open');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDropdowns();
  });

  // ── Custom smooth scrolling for in-page anchors (all pages) ──
  function smoothScrollTo(targetY) {
    targetY = Math.max(0, targetY);
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) return;
    if (reduceMotion) { window.scrollTo(0, targetY); return; }
    // Scale duration sub-linearly (sqrt) so nearby targets travel at a
    // slower per-pixel speed than far ones — closer feels grounded, not
    // snappy — then clamp (495–990ms, ~10% slower than before).
    const duration = Math.min(990, Math.max(495, Math.sqrt(Math.abs(dist)) * 23));
    let start;
    function step(ts) {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Delegated: survives swaps. Only handles same-page `#anchor` links;
  // cross-page links are left for crumple-transition.js to animate.
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    let targetY = 0;
    if (href !== '#') {
      const el = document.getElementById(decodeURIComponent(href.slice(1)));
      if (!el) return; // no matching target — let the browser handle it
      targetY = el.getBoundingClientRect().top + window.scrollY - navOffset();
    }
    e.preventDefault();
    closeDropdowns();
    smoothScrollTo(targetY);
    history.pushState(null, '', href === '#' ? location.pathname + location.search : href);
  });

  // ── Nav highlight on scroll (homepage; harmless elsewhere) ──
  // Re-runnable: disconnect any prior observer and re-observe the current
  // sections. Runs on load and again after each crumple content swap.
  let spyObserver = null;
  function setupScrollSpy() {
    if (spyObserver) { spyObserver.disconnect(); spyObserver = null; }
    const sections = document.querySelectorAll('section[id], div[id]');
    const navItems = document.querySelectorAll('.nav-links li');
    if (!sections.length || !navItems.length) return;
    spyObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
          // Near the top (hero in view) nothing should be active.
          if (window.scrollY < 100) return;
          const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
          if (active) {
            const topLi = active.closest('.nav-links > li');
            if (topLi) topLi.classList.add('active');
          }
        }
      });
    }, { threshold: 0.3 });
    sections.forEach(s => spyObserver.observe(s));
  }
  setupScrollSpy();
  window.addEventListener('scroll', () => {
    if (window.scrollY < 100)
      document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
  }, { passive: true });
  // crumple-transition.js fires this after swapping in a new page's content.
  window.addEventListener('crumple:swapped', setupScrollSpy);

  // ── Contact modal (injected once; every page can open it) ──
  // Injected lazily on first open and appended to <body> (outside .site-wrap),
  // so it persists across content swaps and is never duplicated. Triggers are
  // handled by delegation so new `[data-open-contact]` buttons keep working.
  let modal = null, formStatus = null;

  function ensureModal() {
    if (modal) return;
    document.body.insertAdjacentHTML('beforeend', `
  <div id="contact-modal" class="modal-overlay" hidden>
    <div class="modal-box">
      <button class="modal-close" id="close-contact-modal" aria-label="Close">×</button>
      <h2 class="modal-title">Get in touch</h2>
      <form id="contact-form" action="https://formspree.io/f/xaqkgrbl" method="POST">
        <label class="form-label">Name<input class="form-input" type="text" name="name" required></label>
        <label class="form-label">Email<input class="form-input" type="email" name="email" required></label>
        <label class="form-label">Message<textarea class="form-input" name="message" rows="5" required></textarea></label>
        <button class="contact-btn" type="submit">Send</button>
        <p class="form-status" id="form-status"></p>
      </form>
    </div>
  </div>`);
    modal = document.getElementById('contact-modal');
    formStatus = document.getElementById('form-status');
    const contactForm = document.getElementById('contact-form');
    document.getElementById('close-contact-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    contactForm.addEventListener('submit', submitContact);
  }

  function openModal() {
    ensureModal();
    closeDropdowns();
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    formStatus.textContent = '';
  }

  async function submitContact(e) {
    e.preventDefault();
    const contactForm = e.currentTarget;
    const submitBtn = contactForm.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    formStatus.textContent = 'Sending…';
    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm))),
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        formStatus.textContent = 'Message sent — thank you for reaching out! -Keelan';
        contactForm.reset();
      } else {
        formStatus.textContent = 'Something went wrong. Please try again.';
      }
    } catch {
      formStatus.textContent = 'Network error. Please try again.';
    }
    submitBtn.disabled = false;
  }

  // Delegated trigger/close — survives content swaps.
  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-contact]')) openModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) closeModal();
  });
})();

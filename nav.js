// Shared nav/interaction script, loaded on every page.
(function () {
  // ── Close nav dropdowns on outside-click / Escape / item-click ──
  const dropdowns = document.querySelectorAll('details.nav-dropdown');
  document.addEventListener('click', e => {
    dropdowns.forEach(d => { if (d.open && !d.contains(e.target)) d.removeAttribute('open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') dropdowns.forEach(d => d.removeAttribute('open'));
  });
  dropdowns.forEach(d => d.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => d.removeAttribute('open'))));

  // ── Custom smooth scrolling for in-page anchors (all pages) ──
  // easeInOutCubic — gentle acceleration in, gentle deceleration out.
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const nav = document.querySelector('nav');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const navOffset = () => (nav ? nav.offsetHeight + 12 : 0);

  function smoothScrollTo(targetY) {
    targetY = Math.max(0, targetY);
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) return;
    if (reduceMotion) { window.scrollTo(0, targetY); return; }
    // Scale duration to distance but keep it expedient (450–900ms).
    const duration = Math.min(900, Math.max(450, Math.abs(dist) * 0.5));
    let start;
    function step(ts) {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      window.scrollTo(0, startY + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

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
    dropdowns.forEach(d => d.removeAttribute('open'));
    smoothScrollTo(targetY);
    history.pushState(null, '', href === '#' ? location.pathname + location.search : href);
  });

  // ── Nav highlight on scroll (homepage; harmless elsewhere) ──
  const sections = document.querySelectorAll('section[id], div[id]');
  const navItems = document.querySelectorAll('.nav-links li');
  if (sections.length && navItems.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navItems.forEach(li => li.classList.remove('active'));
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
    sections.forEach(s => observer.observe(s));
    window.addEventListener('scroll', () => {
      if (window.scrollY < 100) navItems.forEach(li => li.classList.remove('active'));
    }, { passive: true });
  }

  // ── Contact modal (injected once so every page can use it) ──
  const triggers = document.querySelectorAll('[data-open-contact]');
  if (!triggers.length) return;

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

  const modal = document.getElementById('contact-modal');
  const closeBtn = document.getElementById('close-contact-modal');
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');

  function openModal() {
    dropdowns.forEach(d => d.removeAttribute('open'));
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    formStatus.textContent = '';
  }

  triggers.forEach(t => t.addEventListener('click', openModal));
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
  });

  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
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
  });
})();

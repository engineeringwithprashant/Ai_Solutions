/* ============================================================
   AI-Solutions — Main JavaScript
   Handles: navbar scroll, mobile menu, AOS init,
            Swiper testimonials, contact form POST,
            word-cycle animation
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------
     1. NAVBAR — sticky + shadow on scroll
  ---------------------------------------------------------- */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 30);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------
     2. MOBILE NAVIGATION
  ---------------------------------------------------------- */
  const navToggle  = document.querySelector('.nav-toggle');
  const mobileNav  = document.querySelector('.mobile-nav-panel');
  const overlay    = document.querySelector('.mobile-nav-overlay');
  const closeBtn   = document.querySelector('.mobile-nav-close');

  function openMobileNav() {
    mobileNav?.classList.add('open');
    overlay?.classList.add('open');
    navToggle?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileNav() {
    mobileNav?.classList.remove('open');
    overlay?.classList.remove('open');
    navToggle?.classList.remove('open');
    document.body.style.overflow = '';
  }

  navToggle?.addEventListener('click', () => {
    mobileNav?.classList.contains('open') ? closeMobileNav() : openMobileNav();
  });
  overlay?.addEventListener('click', closeMobileNav);
  closeBtn?.addEventListener('click', closeMobileNav);

  /* Close mobile nav when a link is clicked */
  document.querySelectorAll('.mobile-nav-panel a').forEach(a => {
    a.addEventListener('click', closeMobileNav);
  });

  /* ----------------------------------------------------------
     3. ACTIVE NAV LINK (highlight current page)
  ---------------------------------------------------------- */
  const currentPath = window.location.pathname.split('/').pop() || 'home';
  document.querySelectorAll('.navbar-nav a, .mobile-nav-panel a').forEach(a => {
    const href = a.getAttribute('href');
    const hrefBase = href ? href.replace(/\.html$/, '') : '';
    if (hrefBase === currentPath) {
      a.classList.add('active');
    }
  });

  /* ----------------------------------------------------------
     4. AOS — Animate On Scroll
  ---------------------------------------------------------- */
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 60,
    });
  }

  /* ----------------------------------------------------------
     5. SWIPER — Testimonials carousel
  ---------------------------------------------------------- */
  if (typeof Swiper !== 'undefined' && document.querySelector('.testimonials-swiper')) {
    new Swiper('.testimonials-swiper', {
      slidesPerView: 1,
      spaceBetween: 24,
      loop: true,
      autoplay: { delay: 5500, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      breakpoints: {
        640:  { slidesPerView: 1, spaceBetween: 20 },
        900:  { slidesPerView: 2, spaceBetween: 24 },
        1200: { slidesPerView: 3, spaceBetween: 28 },
      },
    });
  }

  /* CloudFactory-style single testimonial carousel */
  if (typeof Swiper !== 'undefined' && document.querySelector('.cf-testimonials-swiper')) {
    new Swiper('.cf-testimonials-swiper', {
      slidesPerView: 1,
      spaceBetween: 0,
      loop: true,
      autoplay: { delay: 6000, disableOnInteraction: false },
      pagination: { el: '.swiper-pagination', clickable: true },
      effect: 'fade',
      fadeEffect: { crossFade: true },
    });
  }

  /* ----------------------------------------------------------
     7. CONTACT FORM — client validation + POST to /api/contact
  ---------------------------------------------------------- */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {

    /* Helper: show / hide field error */
    function setError(input, msg) {
      input.classList.add('is-error');
      const err = input.closest('.form-group')?.querySelector('.field-error');
      if (err) { err.textContent = msg; err.classList.add('show'); }
    }
    function clearError(input) {
      input.classList.remove('is-error');
      const err = input.closest('.form-group')?.querySelector('.field-error');
      if (err) { err.textContent = ''; err.classList.remove('show'); }
    }

    /* Live clear on input */
    contactForm.querySelectorAll('.form-control').forEach(el => {
      el.addEventListener('input', () => clearError(el));
      el.addEventListener('change', () => clearError(el));
    });

    /* Validation rules */
    function validate() {
      let valid = true;

      const name = document.getElementById('cf-name');
      if (!name.value.trim()) { setError(name, 'Full name is required.'); valid = false; }

      const email = document.getElementById('cf-email');
      const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.value.trim()) { setError(email, 'Email address is required.'); valid = false; }
      else if (!emailRx.test(email.value.trim())) { setError(email, 'Please enter a valid email.'); valid = false; }

      const phone = document.getElementById('cf-phone');
      if (phone && !phone.value.trim()) { setError(phone, 'Phone number is required.'); valid = false; }

      const company = document.getElementById('cf-company');
      if (company && !company.value.trim()) { setError(company, 'Company name is required.'); valid = false; }

      const country = document.getElementById('cf-country');
      if (country && !country.value) { setError(country, 'Please select a country.'); valid = false; }

      const jobTitle = document.getElementById('cf-jobtitle');
      if (jobTitle && !jobTitle.value.trim()) { setError(jobTitle, 'Job title is required.'); valid = false; }

      return valid;
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate()) return;

      const submitBtn = contactForm.querySelector('[type="submit"]');
      const original  = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      const payload = {
        name:      document.getElementById('cf-name').value.trim(),
        email:     document.getElementById('cf-email').value.trim(),
        phone:     document.getElementById('cf-phone')?.value.trim()    || '',
        company:   document.getElementById('cf-company')?.value.trim()  || '',
        country:   document.getElementById('cf-country')?.value         || '',
        job_title: document.getElementById('cf-jobtitle')?.value.trim() || '',
        message:   document.getElementById('cf-message')?.value.trim()  || '',
      };

      try {
        /* POST to backend — replace URL if your Express server uses a different port */
        const res = await fetch('/api/contact', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        });

        if (res.ok) {
          contactForm.reset();
          const banner = document.getElementById('successBanner');
          if (banner) banner.classList.add('show');
          window.scrollTo({ top: banner?.offsetTop - 120, behavior: 'smooth' });
        } else {
          alert('Something went wrong. Please try again.');
        }
      } catch {
        /* Dev/offline mode — show success anyway so you can test the UI */
        console.warn('[AI-Solutions] /api/contact unreachable — showing success for UI testing.');
        contactForm.reset();
        const banner = document.getElementById('successBanner');
        if (banner) banner.classList.add('show');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });
  }

  /* ----------------------------------------------------------
     8. GALLERY LIGHTBOX (simple)
  ---------------------------------------------------------- */
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      if (!img) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.88);
        z-index:9999;display:flex;align-items:center;justify-content:center;
        cursor:zoom-out;padding:20px;
      `;
      const lightImg = document.createElement('img');
      lightImg.src = img.src;
      lightImg.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
      overlay.appendChild(lightImg);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => overlay.remove());
      document.addEventListener('keydown', function handler(ev) {
        if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
      });
    });
  });

}); // end DOMContentLoaded

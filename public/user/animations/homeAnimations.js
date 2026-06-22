/* homeAnimations.js — VOGUE | Cursor + Scroll Reveal Engine */

(function () {
  // ── Custom Cursor ──────────────────────────────────────
  const dot  = document.createElement('div');
  const ring = document.createElement('div');
  dot.className  = 'cursor-dot';
  ring.className = 'cursor-ring';
  document.body.append(dot, ring);

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left  = mx + 'px';
    dot.style.top   = my + 'px';
  });

  (function animateRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animateRing);
  })();

  // ── Scroll Reveal ──────────────────────────────────────
  const revealEls = document.querySelectorAll(
    '.section-header, .category-card, .product-card, .about-content, .about-image, .reveal, .reveal-left, .reveal-right'
  );

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach(el => {
    if (!el.classList.contains('category-card')) {
      el.classList.add('reveal');
    }
    observer.observe(el);
  });

  // ── Hero Scroll Hint ───────────────────────────────────
  const heroHint = document.querySelector('.hero-scroll-hint');
  if (!heroHint) {
    const hint = document.createElement('div');
    hint.className = 'hero-scroll-hint';
    hint.innerHTML = `<span>Scroll</span><div class="scroll-line"></div>`;
    document.querySelector('.hero-banner')?.appendChild(hint);
  }

  // ── Parallax Hero ──────────────────────────────────────
  const hero = document.querySelector('.hero-banner');
  window.addEventListener('scroll', () => {
    if (!hero) return;
    const y = window.scrollY;
    const content = hero.querySelector('.hero-content');
    if (content) {
      content.style.transform = `translateY(${y * 0.35}px)`;
      content.style.opacity   = Math.max(0, 1 - y / 500);
    }
  }, { passive: true });

  // ── Magnetic CTA Buttons ───────────────────────────────
  document.querySelectorAll('.cta-button, .category-link, .learn-more').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r  = btn.getBoundingClientRect();
      const cx = r.left + r.width  / 2;
      const cy = r.top  + r.height / 2;
      const dx = (e.clientX - cx) * 0.22;
      const dy = (e.clientY - cy) * 0.22;
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

})();
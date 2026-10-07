// ==========================================================================
// FOCUSSIVE — Website Interactivity
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Side Drawer Navigation
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sideDrawer = document.getElementById('sideDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const drawerCloseBtn = document.getElementById('drawerCloseBtn');

  function openDrawer() {
    if (sideDrawer && drawerBackdrop) {
      sideDrawer.classList.add('active');
      drawerBackdrop.classList.add('active');
      sideDrawer.setAttribute('aria-hidden', 'false');
      drawerBackdrop.setAttribute('aria-hidden', 'false');
      if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
    }
  }

  function closeDrawer() {
    if (sideDrawer && drawerBackdrop) {
      sideDrawer.classList.remove('active');
      drawerBackdrop.classList.remove('active');
      sideDrawer.setAttribute('aria-hidden', 'true');
      drawerBackdrop.setAttribute('aria-hidden', 'true');
      if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
    }
  }

  if (menuToggleBtn) menuToggleBtn.addEventListener('click', openDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sideDrawer && sideDrawer.classList.contains('active')) {
      closeDrawer();
    }
  });

  // Screenshot Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      btn.classList.add('active');
      const activePane = document.getElementById(targetTab);
      if (activePane) {
        activePane.classList.add('active');
      }
    });
  });

  // FAQ Accordions
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      // Close other items
      faqItems.forEach(other => other.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // Copy Promo Code function
  window.copyPromoCode = function(code, buttonElement) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = 'Copied to clipboard!';
        setTimeout(() => {
          buttonElement.innerHTML = originalText;
        }, 2000);
      });
    }
  };
});

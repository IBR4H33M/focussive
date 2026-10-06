// ==========================================================================
// FOCUSSIVE — Website Interactivity
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
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

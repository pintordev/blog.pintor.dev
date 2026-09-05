(function () {
  const wrapper = document.getElementById('tail-comment-wrapper');
  if (!wrapper) return;

  function waitForTheme(cb, tries = 50) {
    if (window.Theme && typeof Theme.newThemeMap === 'function') return cb();
    if (tries <= 0) return console.warn('Giscus: Theme object not available');
    setTimeout(() => waitForTheme(cb, tries - 1), 100);
  }

  waitForTheme(() => {
    const themeMapper = Theme.newThemeMap(wrapper.dataset.themeLight, wrapper.dataset.themeDark);
    const initTheme = themeMapper[Theme.resolvedTheme];
    if (!initTheme) return console.warn('Giscus: Failed to determine initial theme');

    let lang = wrapper.dataset.lang || 'en';
    if (lang.length > 2 && !lang.startsWith('zh')) lang = lang.slice(0, 2);

    const giscusNode = document.createElement('script');
    giscusNode.src = 'https://giscus.app/client.js';
    giscusNode.setAttribute('data-repo', wrapper.dataset.repo);
    giscusNode.setAttribute('data-repo-id', wrapper.dataset.repoId);
    giscusNode.setAttribute('data-category', wrapper.dataset.category);
    giscusNode.setAttribute('data-category-id', wrapper.dataset.categoryId);
    giscusNode.setAttribute('data-mapping', wrapper.dataset.mapping || 'pathname');
    giscusNode.setAttribute('data-strict', wrapper.dataset.strict || '0');
    giscusNode.setAttribute('data-reactions-enabled', wrapper.dataset.reactionsEnabled || '0');
    giscusNode.setAttribute('data-emit-metadata', '1');
    giscusNode.setAttribute('data-theme', initTheme);
    giscusNode.setAttribute('data-input-position', wrapper.dataset.inputPosition || 'bottom');
    giscusNode.setAttribute('data-lang', lang);
    giscusNode.setAttribute('data-loading', 'lazy');
    giscusNode.crossOrigin = 'anonymous';
    giscusNode.async = true;

    wrapper.appendChild(giscusNode);

    // theme sync
    let activeRetry = null;
    function postTheme(theme) {
      const iframe = document.querySelector('iframe.giscus-frame');
      if (!iframe) return false;
      // Giscus >= client.js of 2024: while the frame is still loading, setConfig
      // messages are dropped — rewrite the theme query param on the src instead.
      if (iframe.classList.contains('giscus-frame--loading')) {
        const url = new URL(iframe.src);
        url.searchParams.set('theme', theme);
        iframe.src = url.toString();
        return true;
      }
      if (!iframe.contentWindow) return false;
      iframe.contentWindow.postMessage({ giscus: { setConfig: { theme } } }, 'https://giscus.app');
      return true;
    }
    function retryPostTheme(theme, maxRetries = 15, interval = 200) {
      if (activeRetry) clearInterval(activeRetry);
      let tries = 0;
      activeRetry = setInterval(() => {
        if (postTheme(theme) || ++tries >= maxRetries) {
          clearInterval(activeRetry);
          activeRetry = null;
        }
      }, interval);
    }

    retryPostTheme(themeMapper[Theme.resolvedTheme], 15, 500);

    const handler = (event) => {
      if (event.source === window && event.data && event.data.id === Theme.eventId) {
        requestAnimationFrame(() => {
          const newTheme = themeMapper[Theme.resolvedTheme];
          if (!newTheme) return;
          if (!postTheme(newTheme)) retryPostTheme(newTheme, 15, 200);
        });
      }
    };
    addEventListener('message', handler);
  });
})();

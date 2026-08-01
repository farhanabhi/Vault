/**
 * VaultIcons — small set of hand-picked inline SVGs (24x24, stroke-based).
 * Kept local so the app has zero external/CDN dependencies.
 */
(function (global) {
  'use strict';

  const svg = (inner, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    lock: svg('<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>'),
    unlock: svg('<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 8.2-2.6"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.3"/><rect x="13" y="4" width="7" height="7" rx="1.3"/><rect x="4" y="13" width="7" height="7" rx="1.3"/><rect x="13" y="13" width="7" height="7" rx="1.3"/>'),
    note: svg('<path d="M6 3.5h9l3 3V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14.5 3.5V7a1 1 0 0 0 1 1H19"/><path d="M8 12h8M8 15.5h5"/>'),
    file: svg('<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V7a1 1 0 0 0 1 1H18"/>'),
    image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-4 4-2-2-5 5"/>'),
    tag: svg('<path d="M11.5 3.5H5A1.5 1.5 0 0 0 3.5 5v6.5a1.5 1.5 0 0 0 .44 1.06l9 9a1.5 1.5 0 0 0 2.12 0l7-7a1.5 1.5 0 0 0 0-2.12l-9-9a1.5 1.5 0 0 0-1.06-.44z"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.55V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10c.14.6.62 1.34 1.55 1.55H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9 7V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8V7"/><path d="M18.2 7l-.7 12.2a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5.8 7"/><path d="M10 11v6M14 11v6"/>'),
    download: svg('<path d="M12 3.5v11.3"/><path d="M7.5 10.3 12 14.8l4.5-4.5"/><path d="M4.5 18.5h15"/>'),
    upload: svg('<path d="M12 20.5V9.2"/><path d="M7.5 13.7 12 9.2l4.5 4.5"/><path d="M4.5 5.5h15"/>'),
    close: svg('<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
    check: svg('<path d="M4.5 12.5l5 5 10-10.5"/>'),
    chevronLeft: svg('<path d="M15 5l-7 7 7 7"/>'),
    chevronRight: svg('<path d="M9 5l7 7-7 7"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>'),
    warning: svg('<path d="M12 4.2 21.5 20H2.5L12 4.2z"/><path d="M12 10v4.3"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>'),
    shieldCheck: svg('<path d="M12 3.2 19.5 6v6.2c0 4.7-3.2 8-7.5 8.6-4.3-.6-7.5-3.9-7.5-8.6V6L12 3.2z"/><path d="M8.7 12.2l2.3 2.3 4.3-4.6"/>'),
    dots: svg('<circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
    backspace: svg('<path d="M9 5.5H19a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-6-6.5L9 5.5z"/><path d="M13 10l4 4M17 10l-4 4"/>'),
    key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/>'),
    exportIcon: svg('<path d="M4.5 12.5v6a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-6"/><path d="M12 15.5V3.5"/><path d="M7.5 8 12 3.5 16.5 8"/>'),
    importIcon: svg('<path d="M4.5 12.5v6a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-6"/><path d="M12 3.5v12"/><path d="M7.5 11 12 15.5 16.5 11"/>'),
    skull: svg('<path d="M12 3.5c-4.2 0-7 3-7 6.8 0 2.5 1.2 4 2.3 5v2.4c0 .7.6 1.3 1.3 1.3h1.1V17h1v1.9h2.6V17h1v1.9h1.1c.7 0 1.3-.6 1.3-1.3v-2.4c1.1-1 2.3-2.5 2.3-5 0-3.8-2.8-6.8-7-6.8z"/><circle cx="9.3" cy="10.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.5" r="1.3" fill="currentColor" stroke="none"/>'),
    pdf: svg('<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V7a1 1 0 0 0 1 1H18"/><text x="7" y="17" font-size="6.5" fill="currentColor" stroke="none" font-family="ui-monospace,monospace">PDF</text>'),
    edit: svg('<path d="M4 20l.9-3.9L15.6 4.4a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3L8.9 19.1 4 20z"/><path d="M14.3 6.1l3.6 3.6"/>'),
    all: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>')
  };

  global.VaultIcons = ICONS;
})(window);

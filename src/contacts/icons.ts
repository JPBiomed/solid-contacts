/**
 * The few icons the app shows, as inline SVG drawn with `currentColor`, so they
 * follow the theme. Simple strokes, 24-unit grid. Always decorative: every
 * button that carries one also has a text label or an aria-label.
 */
const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>'),
  star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  starFilled: svg('<path fill="currentColor" d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  label: svg('<path d="M3 12V4h8l10 10-7 7z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  merge: svg('<path d="M7 4v5a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v1"/><path d="M17 4v5a5 5 0 0 1-3 4.6"/><path d="M4 7l3-3 3 3"/><path d="M14 7l3-3 3 3"/>'),
  import: svg('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>'),
  export: svg('<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 19h16"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
  message: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7l9 6 9-6"/>'),
  chat: svg('<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  map: svg('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  cake: svg('<path d="M4 20h16v-7H4z"/><path d="M4 16c2 1 4 1 6 0s4-1 6 0 3 1 4 0"/><path d="M12 13V9"/><path d="M12 6.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z"/>'),
  note: svg('<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  work: svg('<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M9 7V4h6v3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>'),
  google: svg('<path d="M20 12.2c0-.6 0-1.1-.1-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.1h2.8c1.6-1.5 2.4-3.7 2.4-6.3z"/><path d="M12 20.5c2.3 0 4.2-.8 5.6-2.1l-2.8-2.1c-.8.5-1.7.8-2.8.8-2.2 0-4-1.5-4.7-3.4H4.4v2.2A8.5 8.5 0 0 0 12 20.5z"/><path d="M7.3 13.7a5 5 0 0 1 0-3.4V8.1H4.4a8.5 8.5 0 0 0 0 7.8z"/><path d="M12 6.9c1.2 0 2.4.4 3.3 1.3l2.4-2.4A8.5 8.5 0 0 0 4.4 8.1l2.9 2.2C8 8.4 9.8 6.9 12 6.9z"/>'),
  file: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  mobile: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
};

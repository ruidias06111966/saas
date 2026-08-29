
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  heart: 'M12 20.5s-7.5-4.7-7.5-10A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.9c0 5.3-7.5 10-7.5 10Z',
  chat: 'M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12Z',
  sparkle: 'M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5ZM19 16l.7 2.2 2.3.8-2.3.8L19 22l-.7-2.2-2.3-.8 2.3-.8L19 16Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm8-3.2a8 8 0 0 0-.13-1.4l2-1.5-2-3.4-2.3 1a8 8 0 0 0-2.4-1.4L14.8 2.6h-4l-.37 2.5a8 8 0 0 0-2.4 1.4l-2.3-1-2 3.4 2 1.5A8 8 0 0 0 5.6 12c0 .48.05.94.13 1.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 2.4 1.4l.37 2.5h4l.37-2.5a8 8 0 0 0 2.4-1.4l2.3 1 2-3.4-2-1.5c.08-.46.13-.92.13-1.4Z',
  shield: 'M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6l-7-3Zm-2.2 8.6 1.9 1.9 3.6-3.8',
  bell: 'M6.5 9.8a5.5 5.5 0 0 1 11 0c0 4.4 1.6 5.7 1.6 5.7H4.9s1.6-1.3 1.6-5.7ZM10 19a2 2 0 0 0 4 0',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  send: 'M4.5 12 20 4.5 14.5 20l-2.8-6.2L4.5 12Z',
  image: 'M4 6h16v12H4zM4 15.5l4.5-4 4 3.5 3-2.5L20 16M9 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  flag: 'M6 21V4h11l-2 3.5L17 11H6',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM6 6l12 12',
  lock: 'M7 11V8.5a5 5 0 0 1 10 0V11M5.5 11h13v9.5h-13z',
  eye: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  star: 'M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9l6-.9L12 3.5Z',
  plus: 'M12 5v14M5 12h14',
  logout: 'M14 5H6v14h8M17 9l3 3-3 3M20 12H10',
  filter: 'M4 6h16M7 12h10M10 18h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.5-1.5L21 21',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5',
  download: 'M12 4v10m0 0 4-4m-4 4-4-4M5 19h14',
  trash: 'M5 7h14M10 7V5h4v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  crown: 'M4 17h16L19 8l-4 3-3-5-3 5-4-3-1 9Z',
  users: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 8a6 6 0 0 1 12 0M17 11.5a2.8 2.8 0 1 0 0-5.6M18 20a5.5 5.5 0 0 0-3-4.9',
  chart: 'M4 20V6M4 20h16M8 20v-6M12 20v-9M16 20V9M20 20v-4',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5.5-5.5 2 2-5.5 5.5-2Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5.2l3.2 2',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14.5 5.5l4 4',
  refresh: 'M20 11a8 8 0 1 0-.7 4.4M20 5v6h-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-9v.5',
  thermometer: 'M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z',
  handshake: 'M4 12l4-4 3 2 3-2 4 4-4 5-3-2-3 2-4-5Z',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className = '', filled = false }: {
  name: IconName; size?: number; className?: string; filled?: boolean;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d={P[name]} />
    </svg>
  );
}

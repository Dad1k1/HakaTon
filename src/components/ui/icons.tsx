import type { SVGProps } from 'react';
type Props = SVGProps<SVGSVGElement> & { size?: number };
const icon = (path: string) =>
  function Icon({ size = 20, ...props }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  };
export const ArrowRight = icon('M4 12h15m-6-6 6 6-6 6');
export const ArrowLeft = icon('M20 12H5m6-6-6 6 6 6');
export const ArrowUpRight = icon('M5 19 18 6M7 6h11v11');
export const ArrowDownRight = icon('M5 5 18 18M7 18h11V7');
export const ChevronLeft = icon('m15 5-7 7 7 7');
export const ChevronRight = icon('m9 5 7 7-7 7');
export const X = icon('m6 6 12 12M18 6 6 18');
export const Plus = icon('M12 4v16M4 12h16');
export const Menu = icon('M4 7h16M4 12h12M4 17h16');
export const LayoutDashboard = icon('M4 4h6v9H4zM14 4h6v5h-6zM4 17h6v3H4zM14 13h6v7h-6z');
export const FileText = icon('M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5');
export const ClipboardList = icon('M8 5H5v16h14V5h-3M9 3h6v4H9zM8 12h8M8 16h6');
export const Clock = icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v6l4 2');
export const CheckCircle2 = icon('M20 9a9 9 0 1 1-4-5M8 11l4 4 8-10');
export const CheckCheck = icon('m3 12 4 4 8-10m-3 9 3 2 7-9');
export const MessageSquare = icon('M4 4h16v13H9l-5 4zM8 9h8M8 13h5');
export const Inbox = icon('M5 4h14l3 11v6H2v-6zM2 15h6l2 3h4l2-3h6');
export const Paperclip = icon('m9 15 7-7a2 2 0 0 1 3 3l-9 9a4 4 0 0 1-6-6L14 4a5 5 0 0 1 7 7');
export const Search = icon('M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6');
export const SlidersHorizontal = icon('M3 6h6m4 0h8M3 18h12m4 0h2M9 3v6m6 6v6M3 12h2m4 0h12M5 9v6');
export const Settings = icon('M4 6h16M4 18h16M8 3v6m8 6v6M4 12h16M13 9v6');
export const Shield = icon('M12 2 4 6v7c0 5 8 9 8 9s8-4 8-9V6z');
export const ShieldCheck = icon('M12 2 4 6v7c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6');
export const Users = icon(
  'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-3c0-6 14-6 14 0v3M17 4c5 0 5 7 0 7m2 4c3 1 3 3 3 6',
);
export const LogOut = icon('M10 3H4v18h6m3-15 6 6-6 6M8 12h12');
export const Bell = icon('M5 16h14l-2-4V8a5 5 0 0 0-10 0v4zM9 20h6');
export const BellOff = icon('M5 16h14l-2-4V8a5 5 0 0 0-10 0v4zM9 20h6M3 3l18 18');
export const Sun = icon(
  'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
);
export const Moon = icon('M18 3A10 10 0 1 0 21 17C10 21 6 9 18 3z');
export const CircleHelp = icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9c0-4 7-3 6 1l-3 3v1m0 3v.1');
export const Compass = icon('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m4 6-2 6-6 2 2-6z');
export const ChartNoAxesCombined = icon('M3 3v18h18M7 17v-4m5 4V9m5 8V5M6 9l5-4 4 1 5-4');

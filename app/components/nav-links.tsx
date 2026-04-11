'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/audit', label: 'Audit' },
  { href: '/gaps', label: 'Gaps' },
  { href: '/traffic', label: 'Traffic' },
  { href: '/report', label: 'Report' },
  { href: '/decay', label: 'Decay' },
  { href: '/trends', label: 'Trends' },
  { href: '/config', label: 'Config' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1">
      {links.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              active
                ? 'text-white bg-neutral-800'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { TextLink } from '@/components/ui';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/actions', label: 'Actions' },
  { href: '/audit', label: 'Audit' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/trends', label: 'Trends' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/performance', label: 'Performance' },
  { href: '/config', label: 'Config' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1">
      {links.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <TextLink
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            size="inherit"
            variant="inherit"
            className={`px-3 py-1.5 rounded-md text-sm ${
              active
                ? 'text-white bg-neutral-800'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
            }`}
          >
            {link.label}
          </TextLink>
        );
      })}
    </div>
  );
}

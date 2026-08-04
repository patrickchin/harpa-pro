import type { ImgHTMLAttributes } from 'react';

import brandIcon from '@/assets/brand-icon.svg';
import { cn } from '@/lib/cn';

interface BrandMarkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> {
  decorative?: boolean;
}

export function BrandMark({
  className,
  decorative = false,
  ...props
}: BrandMarkProps): React.JSX.Element {
  return (
    <img
      alt={decorative ? '' : 'Harpa Pro'}
      className={cn('size-10 shrink-0 rounded-card-ui', className)}
      data-testid="brand-mark"
      src={brandIcon}
      {...props}
    />
  );
}

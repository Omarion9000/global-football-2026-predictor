import type { ReactElement } from 'react';

type FlagChipProps = {
  /** ISO 3166-1 alpha-2 (or ISO 3166-2 subdivision) code in lowercase, matching
   *  the `flag-icons` CSS class convention (e.g. 'fr', 'gb-eng'). */
  readonly code: string;
  /** Country display name, used for the accessible label. */
  readonly displayName: string;
  /** Pixel width of the chip; height is auto from `flag-icons`'s 4:3 ratio.
   *  Common sizes: 16 (inline), 22 (table row), 32 (group panel), 44 (hero). */
  readonly size?: number;
};

export function FlagChip({ code, displayName, size = 22 }: FlagChipProps): ReactElement {
  const dims = { width: `${size}px`, height: `${Math.round(size * 0.75)}px` };
  return (
    <span
      role="img"
      aria-label={`${displayName} flag`}
      className={`bp-flag fi fi-${code}`}
      style={dims}
    />
  );
}

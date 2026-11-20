import React, { useId } from 'react';

interface IceShieldIconProps {
  active?: boolean;
  className?: string;
}

const OUTER_SHIELD_PATH =
  'M12 2.1L20.1 5.1V11.2C20.1 16.45 16.55 19.95 12 21.9C7.45 19.95 3.9 16.45 3.9 11.2V5.1L12 2.1Z';

const RIGHT_FACET_PATH =
  'M12 2.1L20.1 5.1V11.2C20.1 16.45 16.55 19.95 12 21.9V2.1Z';

const INNER_CREST_PATH =
  'M12 5.4L16.7 7.15V11.2C16.7 14.45 14.55 16.85 12 18.15C9.45 16.85 7.3 14.45 7.3 11.2V7.15L12 5.4Z';

const INNER_LEFT_HIGHLIGHT_PATH =
  'M12 5.4L7.3 7.15V11.2C7.3 14.45 9.45 16.85 12 18.15V5.4Z';

export const IceShieldIcon: React.FC<IceShieldIconProps> = ({
  active = true,
  className = 'w-3.5 h-3.5',
}) => {
  const uid = useId().replace(/:/g, '');
  const baseGradId = `ice-shield-base-${uid}`;
  const rightFacetGradId = `ice-shield-facet-${uid}`;
  const coreGradId = `ice-shield-core-${uid}`;

  if (!active) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path d={OUTER_SHIELD_PATH} fill="currentColor" opacity="0.55" />
        <path d={RIGHT_FACET_PATH} fill="currentColor" opacity="0.22" />
        <path d={INNER_CREST_PATH} fill="currentColor" opacity="0.2" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`${className} drop-shadow-[0_0_5px_rgba(56,189,248,0.38)]`}
    >
      <defs>
        <linearGradient
          id={baseGradId}
          x1="4"
          y1="2.1"
          x2="20"
          y2="21.9"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="50%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient
          id={rightFacetGradId}
          x1="12"
          y1="2.1"
          x2="20.1"
          y2="21.9"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0369A1" stopOpacity="0.56" />
        </linearGradient>
        <linearGradient
          id={coreGradId}
          x1="7.3"
          y1="5.4"
          x2="16.7"
          y2="18.15"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.88" />
          <stop offset="55%" stopColor="#7DD3FC" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0284C7" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      <path d={OUTER_SHIELD_PATH} fill={`url(#${baseGradId})`} />
      <path d={RIGHT_FACET_PATH} fill={`url(#${rightFacetGradId})`} />
      <path d={INNER_CREST_PATH} fill={`url(#${coreGradId})`} />
      <path d={INNER_LEFT_HIGHLIGHT_PATH} fill="#F0F9FF" opacity="0.32" />
    </svg>
  );
};

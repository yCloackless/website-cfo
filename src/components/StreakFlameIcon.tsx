import React, { useId } from 'react';

interface StreakFlameIconProps {
  active?: boolean;
  className?: string;
}

const OUTER_FLAME_PATH =
  'M12.6 2.3C15.8 5.2 18 9.2 18 14.2C18 17.95 15.31 21 12 21C8.69 21 6 17.95 6 14.2C6 11.4 7.15 9.15 8.55 7.65C8.85 7.32 9.4 7.52 9.42 7.97C9.47 9.05 10.05 9.9 10.7 10.25C10.55 7.45 11.35 4.45 12.6 2.3Z';

const INNER_CORE_PATH =
  'M12.3 11.4C13.7 12.9 14.6 14.6 14.6 16.5C14.6 18.2 13.44 19.6 12 19.6C10.56 19.6 9.4 18.2 9.4 16.5C9.4 14.8 10.5 13 12.3 11.4Z';

export const StreakFlameIcon: React.FC<StreakFlameIconProps> = ({
  active = true,
  className = 'w-3.5 h-3.5',
}) => {
  const uid = useId().replace(/:/g, '');
  const outerGradId = `streak-flame-outer-${uid}`;
  const coreGradId = `streak-flame-core-${uid}`;

  if (!active) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path
          d={`${OUTER_FLAME_PATH} ${INNER_CORE_PATH}`}
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          opacity="0.65"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`${className} drop-shadow-[0_0_5px_rgba(249,115,22,0.38)]`}
    >
      <defs>
        <linearGradient id={outerGradId} x1="12" y1="2" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="48%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        <linearGradient id={coreGradId} x1="12" y1="11.4" x2="12" y2="19.6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF9C3" />
          <stop offset="100%" stopColor="#FDBA74" />
        </linearGradient>
      </defs>
      <path d={OUTER_FLAME_PATH} fill={`url(#${outerGradId})`} />
      <path
        d={INNER_CORE_PATH}
        fill={`url(#${coreGradId})`}
        className="animate-flame-core"
      />
    </svg>
  );
};

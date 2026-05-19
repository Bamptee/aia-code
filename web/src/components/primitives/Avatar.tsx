interface AvatarProps {
  initials: string;
  size?: number;
}

/**
 * Avatar gradient deterministic par initials (handoff §13).
 * Le gradient est dérivé d'un hash simple sur les initials, donc 2 users
 * différents avec mêmes initials auraient le même gradient — c'est OK pour
 * un outil solo-dev (un seul user). Story 2.x raffinera si multi-user.
 */
export function Avatar({ initials, size = 32 }: AvatarProps) {
  const { from, to } = gradientFor(initials);
  return (
    <div
      aria-label={initials}
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Hash simple + map vers une palette pré-définie (lisible sur fond clair et foncé). */
function gradientFor(initials: string): { from: string; to: string } {
  const palette: { from: string; to: string }[] = [
    { from: '#6c4d99', to: '#1f5d8c' }, // product → dev
    { from: '#2f6f3d', to: '#1e4d8c' }, // qa → blue
    { from: '#8a5a00', to: '#9b2c2c' }, // amber → red
    { from: '#5b3a8c', to: '#6c4d99' }, // purple → product
    { from: '#0052cc', to: '#5e36bf' }, // bb-open → bb-merged
    { from: '#1f5d8c', to: '#2f6f3d' }, // dev → qa
  ];
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = (hash * 31 + initials.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

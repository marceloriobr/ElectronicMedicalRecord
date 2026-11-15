type Props = { className?: string };

/** Flor de lótus em traço, inspirada no logo do consultório. */
export function LotusIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinejoin="round"
      className={className}
    >
      {/* pétala central */}
      <path d="M32 4C24 14 24 32 32 44C40 32 40 14 32 4Z" />
      {/* pétalas laterais */}
      <path d="M32 44C22 40 14 30 14 16C24 18 31 28 32 44Z" />
      <path d="M32 44C42 40 50 30 50 16C40 18 33 28 32 44Z" />
      {/* pétalas externas */}
      <path d="M32 44C20 46 8 40 4 30C14 28 26 34 32 44Z" />
      <path d="M32 44C44 46 56 40 60 30C50 28 38 34 32 44Z" />
    </svg>
  );
}

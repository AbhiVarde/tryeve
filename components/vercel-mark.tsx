export function VercelMark({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 76 65"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className ?? "text-foreground"}
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

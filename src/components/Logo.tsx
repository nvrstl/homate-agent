export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#172736" />
      <path
        d="M20 40V24l12-8 12 8v16"
        stroke="#00A676"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="34" r="4" fill="#00A676" />
    </svg>
  );
}

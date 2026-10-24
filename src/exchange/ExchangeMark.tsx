// Temporary Exchange mark: two opposing arrows, amber and teal. Matches
// public/assets/exchange-mark.svg and the app icons generated from it.
export default function ExchangeMark({ size = 30 }: { size?: number }) {
  return <svg className="exchange-mark" width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true">
    <rect x="6" y="6" width="116" height="116" rx="26" fill="#15130f" stroke="#3a2f1e" strokeWidth="4" />
    <path d="M30 48h60M76 34l14 14-14 14" stroke="#f2a33a" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M98 80H38M52 66 38 80l14 14" stroke="#3fc1b0" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

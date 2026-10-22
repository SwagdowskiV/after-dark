// Animated haunted-mansion silhouette for the menu screens.
export default function MansionBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="moon" />
      <svg className="mansion-svg" viewBox="0 0 800 360" preserveAspectRatio="xMidYMax meet">
        <path
          className="mansion-shape"
          d="M60 360 V210 L130 150 L200 210 V360 Z M200 360 V180 L260 120 L300 150 V90 L330 60 L360 90 V150 L400 110 L470 170 L540 110 L600 170 V360 Z M600 360 V220 L670 160 L740 220 V360 Z M318 60 h24 v-30 h-24 Z"
        />
        {[
          [95, 240], [150, 240], [235, 210], [235, 270], [320, 120], [385, 200], [455, 200],
          [455, 270], [525, 200], [525, 270], [640, 250], [700, 250],
        ].map(([x, y], i) => (
          <rect key={i} className="window" style={{ animationDelay: `${(i * 1.7) % 7}s` }} x={x} y={y} width="22" height="30" rx="3" />
        ))}
        <rect x="380" y="290" width="40" height="70" rx="20" className="door" />
      </svg>
      <div className="fog fog-a" />
      <div className="fog fog-b" />
    </div>
  );
}

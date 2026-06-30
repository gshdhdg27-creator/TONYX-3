/**
 * Colored fixed top banner per section.
 * z-index 50 — below Header (200) so balance pills stay on top.
 */
interface SectionBarProps {
  gradient: string;
}

export default function SectionBar({ gradient }: SectionBarProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: gradient,
        zIndex: 50,
        pointerEvents: "none",
      }}
    />
  );
}

type Props = {
  className?: string;
  /** Set on surfaces that never go dark themselves (e.g. the public
   * marketing pages) so the plane doesn't switch to its light-mode variant
   * — and vanish against an always-light background — if the visitor has
   * app-wide dark mode on from a previous session. */
  staysLight?: boolean;
};

/**
 * The WriTask mark. Same original artwork (public/logo (1).png) in both
 * themes — only the plane's color changes for dark mode, via a second PNG
 * (public/logo-dark.png) with just the plane's pixels recolored (same
 * shape/anti-aliasing, nothing redesigned) so it stays visible against a
 * dark navbar instead of the original dark-navy plane disappearing into it.
 */
export default function Logo({ className = "w-10 h-10", staysLight = false }: Props) {
  if (staysLight) {
    return <img src="/logo (1).png" alt="WriTask" className={`${className} object-contain`} />;
  }
  return (
    <>
      <img src="/logo (1).png" alt="WriTask" className={`${className} object-contain dark:hidden`} />
      <img src="/logo-dark.png" alt="WriTask" className={`${className} object-contain hidden dark:block`} />
    </>
  );
}

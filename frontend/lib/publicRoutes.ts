/** Routes that should not run authenticated bootstrap fetches */
export function isPublicAuthPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/verify-otp")
  );
}

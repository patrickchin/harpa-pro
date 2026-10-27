// File-format builds expose .html paths while Pages serves extensionless URLs.
export function canonicalPathname(pathname: string): string {
  return pathname.replace(/(?:\/index)?\.html$/, '').replace(/\/+$/, '') || '/';
}

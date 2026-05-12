export const metadata = {
  title: 'harpa-pro docs',
  description: 'In-app guides and visual reference.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

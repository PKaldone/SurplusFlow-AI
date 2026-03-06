import React from 'react';

export const metadata = {
  title: 'SurplusFlow Portal',
  description: 'Claimant Portal for Surplus Recovery',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

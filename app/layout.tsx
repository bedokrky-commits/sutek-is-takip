import './styles.css'
import './v16-professional.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SUTEK İş Takip',
  description: 'SUTEK Ofis ve Servis İş Takip Sistemi',
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>
}

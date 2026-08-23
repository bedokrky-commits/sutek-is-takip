import './styles.css'
import './v16-professional.css'
import type { Metadata, Viewport } from 'next'
import PWARegister from './pwa-register'

export const metadata: Metadata = {
  title: 'SUTEK İş Takip',
  description: 'SUTEK Ofis ve Servis İş Takip Sistemi',
  applicationName: 'SUTEK İş Takip',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/sutek-app-192-v242.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/sutek-app-512-v242.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/sutek-apple-180-v242.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },
  appleWebApp: {
    capable: true,
    title: 'SUTEK İş Takip',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#10182b',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  )
}

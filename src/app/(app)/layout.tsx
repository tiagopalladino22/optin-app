import Sidebar from '@/components/Sidebar'
import { DataProvider } from '@/lib/DataProvider'
import { ThemeProvider } from '@/lib/ThemeProvider'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <DataProvider>
        <div className="flex h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
          <Sidebar />
          <main className="flex-1 p-8 overflow-auto">
            {children}
          </main>
        </div>
      </DataProvider>
    </ThemeProvider>
  )
}

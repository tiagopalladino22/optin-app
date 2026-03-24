import Sidebar from '@/components/Sidebar'
import { DataProvider } from '@/lib/DataProvider'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DataProvider>
      <div className="flex h-screen bg-offwhite">
        <Sidebar />
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </DataProvider>
  )
}

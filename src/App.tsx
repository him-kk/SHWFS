import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { siteConfig } from './config'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ProcessingPanel from './pages/Processing'
import ResultsViewer from './pages/Results'
import History from './pages/History'
import Calibration from './pages/Calibration'
import Documentation from './pages/Documentation'

/* Landing page sections */
import HeroLanding from './sections/landing/HeroLanding'
import Manifesto from './sections/landing/Manifesto'
import Modules from './sections/landing/Modules'
import LiveFeed from './sections/landing/LiveFeed'
import Publications from './sections/landing/Publications'
import LandingFooter from './sections/landing/LandingFooter'

function LandingPage() {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    const el = document.getElementById(id)
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
  }, [hash])

  return (
    <>
      <main>
        <HeroLanding />
        <Manifesto />
        <Modules />
        <LiveFeed />
        <Publications />
      </main>
      <LandingFooter />
    </>
  )
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#000' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: '240px',
          minHeight: '100vh',
          background: '#000',
          overflowX: 'hidden',
        }}
      >
        {children}
      </main>
    </div>
  )
}

function App() {
  useEffect(() => {
    document.title = siteConfig.siteTitle || 'AO Wavefront Control System'
    document.documentElement.lang = siteConfig.language || 'en'

    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.name = 'description'
      document.head.appendChild(metaDescription)
    }
    metaDescription.content = siteConfig.siteDescription || ''
  }, [])

  return (
    <Routes>
      {/* Landing page — no sidebar */}
      <Route path="/" element={<LandingPage />} />

      {/* Dashboard app — with sidebar */}
      <Route
        path="/dashboard"
        element={
          <DashboardLayout>
            <Dashboard />
          </DashboardLayout>
        }
      />
      <Route
        path="/processing"
        element={
          <DashboardLayout>
            <ProcessingPanel />
          </DashboardLayout>
        }
      />
      <Route
        path="/results"
        element={
          <DashboardLayout>
            <ResultsViewer />
          </DashboardLayout>
        }
      />
      <Route
        path="/history"
        element={
          <DashboardLayout>
            <History />
          </DashboardLayout>
        }
      />
      <Route
        path="/calibration"
        element={
          <DashboardLayout>
            <Calibration />
          </DashboardLayout>
        }
      />
      <Route
        path="/documentation"
        element={
          <DashboardLayout>
            <Documentation />
          </DashboardLayout>
        }
      />
    </Routes>
  )
}

export default App

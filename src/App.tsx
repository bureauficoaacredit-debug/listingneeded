import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import React, { lazy, Suspense } from 'react'
// v59: Home + Search stay in the main bundle; heavier pages (admin, list form, detail, CMA…) load on demand
const List = lazy(() => import('./pages/List'))
const ListingDetail = lazy(() => import('./pages/ListingDetail'))
const Admin = lazy(() => import('./pages/Admin'))
const Cma = lazy(() => import('./pages/Cma'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const QrPrint = lazy(() => import('./pages/QrPrint'))

const lazyPage = (el: React.ReactNode) => (
  <Suspense fallback={<div className="page-loading" style={{ padding: '3rem 1rem', textAlign: 'center' }}>Loading…</div>}>{el}</Suspense>
)

function ListedBanner() {
  const { search } = useLocation()
  if (!search.includes('listed=1')) return null
  return (
    <div className="success" style={{marginBottom:'1rem'}}>
      {search.includes('free=1') ? 'Thanks! Your free listing is live' : 'Payment received. Your listing is live'} — people will contact you directly.
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="browse" element={<Browse />} />
        <Route path="list" element={lazyPage(<List />)} />
        <Route path="listing/:id" element={lazyPage(<><ListedBanner /><ListingDetail /></>)} />
        <Route path="cma" element={lazyPage(<Cma />)} />
        <Route path="check-landlord" element={<Navigate to="/" replace />} />
        <Route path="admin" element={lazyPage(<Admin />)} />
        <Route path="reset-password" element={lazyPage(<ResetPassword />)} />
        <Route path="qr/:kind" element={lazyPage(<QrPrint />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

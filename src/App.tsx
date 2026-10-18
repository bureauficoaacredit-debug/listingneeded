import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import React, { lazy, Suspense } from 'react'
// v59: Home + Search stay in the main bundle; heavier pages (admin, list form, detail, CMA…) load on demand
// v62: if a page chunk is gone (tab opened before a new deploy), reload once to get the new build instead of a blank page
const lazyPageImport = <T,>(load: () => Promise<T>) => () =>
  load()
    .then((m) => {
      sessionStorage.removeItem('ln_chunk_reload')
      return m
    })
    .catch((err) => {
    if (!sessionStorage.getItem('ln_chunk_reload')) {
      sessionStorage.setItem('ln_chunk_reload', '1')
      window.location.reload()
      return new Promise<T>(() => {})
    }
    throw err
  })
const List = lazy(lazyPageImport(() => import('./pages/List')))
const ListingDetail = lazy(lazyPageImport(() => import('./pages/ListingDetail')))
const Admin = lazy(lazyPageImport(() => import('./pages/Admin')))
const Cma = lazy(lazyPageImport(() => import('./pages/Cma')))
const ResetPassword = lazy(lazyPageImport(() => import('./pages/ResetPassword')))
const Blog = lazy(lazyPageImport(() => import('./pages/Blog')))
const BlogPost = lazy(lazyPageImport(() => import('./pages/BlogPost')))
// v68: header-menu pages (lazy: no weight on Search)
const AverageRent = lazy(lazyPageImport(() => import('./pages/AverageRent')))
const RentCalculator = lazy(lazyPageImport(() => import('./pages/calculators/RentCalculator')))
const CostOfLiving = lazy(lazyPageImport(() => import('./pages/calculators/CostOfLiving')))
const RentVsBuy = lazy(lazyPageImport(() => import('./pages/calculators/RentVsBuy')))
const QrPrint = lazy(lazyPageImport(() => import('./pages/QrPrint')))

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
        <Route path="blog" element={lazyPage(<Blog />)} />
        <Route path="blog/:slug" element={lazyPage(<BlogPost />)} />
        <Route path="qr/:kind" element={lazyPage(<QrPrint />)} />
        <Route path="average-rent" element={lazyPage(<AverageRent />)} />
        <Route path="calculators/rent" element={lazyPage(<RentCalculator />)} />
        <Route path="calculators/cost-of-living" element={lazyPage(<CostOfLiving />)} />
        <Route path="calculators/rent-vs-buy" element={lazyPage(<RentVsBuy />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import List from './pages/List'
import ListingDetail from './pages/ListingDetail'
import Admin from './pages/Admin'

function ListedBanner() {
  const { search } = useLocation()
  if (!search.includes('listed=1')) return null
  return (
    <div className="success" style={{marginBottom:'1rem'}}>
      Payment received. Your listing is live — people will contact you directly.
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="browse" element={<Browse />} />
        <Route path="list" element={<List />} />
        <Route path="listing/:id" element={<><ListedBanner /><ListingDetail /></>} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

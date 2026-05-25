import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import CreateListing from './pages/CreateListing'
import ListingDetail from './pages/ListingDetail'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/create" element={<CreateListing />} />
      <Route path="/listing/:id" element={<ListingDetail />} />
    </Routes>
  )
}

import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import CreateListing from './pages/CreateListing'
import ListingDetail from './pages/ListingDetail'
import RegisterPage from './pages/RegisterPage'
import MusicBox from './components/MusicBox'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/create" element={<CreateListing />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
      </Routes>
      {/* EC 全站共享音乐盒：所有页面右下角悬浮入口 */}
      <MusicBox />
    </>
  )
}

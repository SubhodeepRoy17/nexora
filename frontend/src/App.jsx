import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/common/Navbar'
import BuyerChat from './pages/BuyerChat'
import MerchantDashboard from './pages/MerchantDashboard'

export default function App() {
  return (
    <div className="min-h-dvh bg-slate-950">
      <Navbar />
      <Routes>
        <Route path="/" element={<BuyerChat />} />
        <Route path="/merchant" element={<MerchantDashboard />} />
        <Route path="/merchant/inventory" element={<MerchantDashboard />} />
        <Route path="/merchant/analytics" element={<MerchantDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

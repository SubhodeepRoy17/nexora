import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/common/Navbar'
import ProtectedRoute from './components/auth/ProtectedRoute'
import BuyerChat from './pages/BuyerChat'
import Login from './pages/Login'
import MerchantDashboard from './pages/MerchantDashboard'

export default function App() {
  return (
    <div className="min-h-dvh bg-slate-950">
      <Navbar />
      <Routes>
        <Route path="/" element={<BuyerChat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/merchant" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/inventory" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/analytics" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

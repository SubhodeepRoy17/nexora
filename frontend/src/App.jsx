import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/common/Navbar'
import NexoraCursor from './components/common/NexoraCursor'
import ProtectedRoute from './components/auth/ProtectedRoute'
import BuyerChat from './pages/BuyerChat'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import MerchantDashboard from './pages/MerchantDashboard'

export default function App() {
  return (
    <div className="min-h-dvh bg-[#f6f5f1]">
      <NexoraCursor />
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/buyer" element={<BuyerChat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/merchant" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/inventory" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/analytics" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

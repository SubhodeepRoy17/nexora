import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Navbar from './components/common/Navbar'
import ProtectedRoute from './components/auth/ProtectedRoute'
import CrossSiteCookiePrompt from './components/auth/CrossSiteCookiePrompt'
import BuyerChat from './pages/BuyerChat'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import MerchantDashboard from './pages/MerchantDashboard'
import SharedConversation from './pages/SharedConversation'

export default function App() {
  const location = useLocation()
  const authPage = location.pathname === '/login'

  return (
    <div className="min-h-dvh bg-[#f6f5f1]">
      <CrossSiteCookiePrompt />
      {!authPage && <Navbar />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/buyer" element={<BuyerChat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/share/:shareToken" element={<SharedConversation />} />
        <Route path="/merchant" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/inventory" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="/merchant/analytics" element={<ProtectedRoute role="merchant"><MerchantDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

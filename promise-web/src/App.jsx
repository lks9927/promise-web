import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AdminDashboard from './pages/AdminDashboard'
import TeamLeaderDashboard from './pages/TeamLeaderDashboard'
import DealerDashboard from './pages/DealerDashboard'
import MasterDashboard from './pages/MasterDashboard'
import PartnerApply from './pages/PartnerApply'
import CustomerStatus from './pages/CustomerStatus'

// Placeholder Pages
import Login from './pages/Login'
import ProjectStatus from './pages/ProjectStatus'
const Dashboard = () => <div className="p-10 text-xl text-center">대시보드 (딜러/팀장)</div>
import MobileBriefing from './pages/MobileBriefing'
import DevLogin from './pages/DevLogin'

import { NotificationProvider, useNotification } from './contexts/NotificationContext'
import Toast from './components/common/Toast'

function AppContent() {
  const { toast, showToast } = useNotification();
  return (
    <>
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => showToast(null)}
        />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/master" element={<MasterDashboard />} />
        <Route path="/leader" element={<TeamLeaderDashboard />} />
        <Route path="/dealer" element={<DealerDashboard />} />
        <Route path="/apply" element={<PartnerApply />} />
        <Route path="/mypage" element={<CustomerStatus />} />
        <Route path="/login" element={<Login />} />
        <Route path="/status" element={<ProjectStatus />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/briefing" element={<MobileBriefing />} />
        <Route path="/dev" element={<DevLogin />} />
        <Route path="*" element={<div className="flex items-center justify-center h-screen bg-gray-100 text-xl font-bold text-gray-600">404 - 페이지를 찾을 수 없습니다</div>} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </div>
  )
}

export default App

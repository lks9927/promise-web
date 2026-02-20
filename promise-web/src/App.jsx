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

function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
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
      </Routes>
    </div>
  )
}

export default App

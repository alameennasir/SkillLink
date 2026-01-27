import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import ClientLayout from './layouts/ClientLayout'
import FreelancerLayout from './layouts/FreelancerLayout'
import AdminLayout from './layouts/AdminLayout'
import AuthLogin from './routes/AuthLogin'
import AuthRegister from './routes/AuthRegister'
import AuthAdminRegister from './routes/AuthAdminRegister'
import ClientDashboard from './routes/ClientDashboard'
import ClientManageGigs from './routes/ClientManageGigs'
import ClientMessages from './routes/ClientMessages'
import ClientOnboarding from './routes/ClientOnboarding'
import ClientPostGig from './routes/ClientPostGig'
import ClientTalentSearch from './routes/ClientTalentSearch'
import ClientGigApplicants from './routes/ClientGigApplicants'
import ClientApplicantOverview from './routes/ClientApplicantOverview'
import FreelancerDashboard from './routes/FreelancerDashboard'
import FreelancerGigDetail from './routes/FreelancerGigDetail'
import FreelancerMessages from './routes/FreelancerMessages'
import FreelancerMyGigs from './routes/FreelancerMyGigs'
import FreelancerMyProposals from './routes/FreelancerMyProposals'
import FreelancerOpportunities from './routes/FreelancerOpportunities'
import FreelancerProfile from './routes/FreelancerProfile'
import FreelancerProposalDetail from './routes/FreelancerProposalDetail'
import FreelancerOnboarding from './routes/FreelancerOnboarding'
import Landing from './routes/Landing'
import AdminDashboard from './routes/AdminDashboard'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/login" element={<AuthLogin />} />
          <Route path="/auth/register" element={<AuthRegister />} />
          <Route path="/auth/admin/register" element={<AuthAdminRegister />} />
          <Route
            path="/onboarding/client"
            element={
              <ProtectedRoute allowRoles={['client']}>
                <ClientOnboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding/freelancer"
            element={
              <ProtectedRoute allowRoles={['freelancer']}>
                <FreelancerOnboarding />
              </ProtectedRoute>
            }
          />

          <Route
            path="/client/*"
            element={
              <ProtectedRoute allowRoles={['client']}>
                <ClientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ClientDashboard />} />
            <Route path="dashboard" element={<Navigate to="/client" replace />} />
            <Route path="post-gig" element={<ClientPostGig />} />
            <Route path="manage-gigs" element={<ClientManageGigs />} />
            <Route path="manage-gigs/:gigId/applicants" element={<ClientGigApplicants />} />
            <Route
              path="manage-gigs/:gigId/applicants/:applicantId"
              element={<ClientApplicantOverview />}
            />
            <Route path="talent-search" element={<ClientTalentSearch />} />
            <Route path="messages" element={<ClientMessages />} />
            <Route path="*" element={<Navigate to="/client" replace />} />
          </Route>

          <Route
            path="/freelancer/*"
            element={
              <ProtectedRoute allowRoles={['freelancer']}>
                <FreelancerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<FreelancerDashboard />} />
            <Route path="opportunities" element={<FreelancerOpportunities />} />
            <Route path="opportunities/:gigId" element={<FreelancerGigDetail />} />
            <Route path="my-gigs" element={<FreelancerMyGigs />} />
            <Route path="my-proposals" element={<FreelancerMyProposals />} />
            <Route path="proposals/:gigId" element={<FreelancerProposalDetail />} />
            <Route path="messages" element={<FreelancerMessages />} />
            <Route path="profile" element={<FreelancerProfile />} />
            <Route path="dashboard" element={<Navigate to="/freelancer" replace />} />
          </Route>

            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowRoles={['admin']}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<Navigate to="/admin" replace />} />
            </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

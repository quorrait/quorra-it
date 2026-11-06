import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, DataProvider, useAuth } from "./lib/app";
import { Spinner, ToastProvider } from "./components/ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Customers from "./pages/Customers";
import Leads from "./pages/Leads";
import Estimates from "./pages/Estimates";
import EstimateDetail from "./pages/EstimateDetail";
import PriceBook from "./pages/PriceBook";
import ServicePlans from "./pages/ServicePlans";
import PurchaseOrders from "./pages/PurchaseOrders";
import Team from "./pages/Team";
import Timesheets from "./pages/Timesheets";
import Reports from "./pages/Reports";
import Settings, { More } from "./pages/Settings";

function Gate() {
  const { ready, email } = useAuth();
  if (!ready) return <Spinner />;
  if (!email) return <Login />;
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="leads" element={<Leads />} />
          <Route path="estimates" element={<Estimates />} />
          <Route path="estimates/:id" element={<EstimateDetail />} />
          <Route path="pricebook" element={<PriceBook />} />
          <Route path="plans" element={<ServicePlans />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="team" element={<Team />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}

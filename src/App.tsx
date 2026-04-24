import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LandingPage } from "./screens/LandingPage";
import { DiscoveryPage } from "./screens/DiscoveryPage";
import { QuotePage } from "./screens/QuotePage";
import { CheckoutPage } from "./screens/CheckoutPage";
import { ConfirmationPage } from "./screens/ConfirmationPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/gesprek" element={<DiscoveryPage />} />
        <Route path="/voorstel" element={<QuotePage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/bevestigd" element={<ConfirmationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import WhyVaultLogic from "./components/WhyVaultLogic";
import AIAnalytics from "./components/AIAnalytics";
import FeatureGrid from "./components/FeatureGrid";
import Testimonials from "./components/Testimonials";
import FinalCTA from "./components/FinalCTA";
import { Button } from "@/components/ui/button";
import { GoogleLogin } from "@/components/GoogleLogin";
import logo from "@/assets/images/logo.jpg";

export default function LandingPage() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <main className="min-h-screen bg-white">
      {/* Header with Login */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="Vault-Logic Logo"
                className="w-8 h-8 rounded-lg object-cover"
              />
              <span className="text-xl font-bold text-white">Vault-Logic</span>
            </div>
            {googleClientId ? (
              <div className="bg-white rounded-xl">
                <GoogleLogin data-testid="button-login" />
              </div>
            ) : (
              <Button
                onClick={() => window.location.href = '/api/auth/dev-login'}
                data-testid="button-dev-login"
                className="bg-white text-indigo-700 hover:bg-white/90"
              >
                Dev Login
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Marketing Sections */}
      <Hero />
      <HowItWorks />
      <WhyVaultLogic />
      <AIAnalytics />
      <FeatureGrid />
      <Testimonials />
      <FinalCTA />

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} Vault-Logic. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

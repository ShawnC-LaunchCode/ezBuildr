import logo from "@/assets/images/logo.png";
import { Button } from "@/components/ui/button";
import EasyAdvancedStory from "./components/EasyAdvancedStory";
import FeatureGrid from "./components/FeatureGrid";
import FinalCTA from "./components/FinalCTA";
import Hero from "./components/Hero";
import TargetAudience from "./components/TargetAudience";
export default function LandingPage() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return (
    <main className="min-h-screen bg-white font-sans">
      {/* Header with Login */}
      <header className="absolute top-0 left-0 right-0 z-10 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="ezBuildr Logo"
                className="w-10 h-10 rounded-xl shadow-lg object-cover"
              />
              <span className="text-2xl font-bold text-white tracking-tight">ezBuildr</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                className="text-gray-600 hover:text-gray-900 font-medium"
                onClick={() => window.location.href = '/auth/login'}
              >
                Sign In
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md"
                onClick={() => window.location.href = '/auth/register'}
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>
      {/* Marketing Sections */}
      <Hero />
      <EasyAdvancedStory />
      <FeatureGrid />
      <TargetAudience />
      <FinalCTA />
      {/* Footer */}
      <footer className="bg-slate-50 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-gray-900">ezBuildr</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500 text-sm">Valid Logic, Beautiful Forms.</span>
            </div>
            <div className="text-center text-sm text-gray-500">
              <p>&copy; {new Date().getFullYear()} ezBuildr. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
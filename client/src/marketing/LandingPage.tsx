import "./landing.css";

import BentoFeatures from "./components/BentoFeatures";
import { QuoteSection, FinalCta, Footer } from "./components/Closing";
import CodeShowcase from "./components/CodeShowcase";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import MarqueeStrip from "./components/MarqueeStrip";
import NavBar from "./components/NavBar";

export default function LandingPage() {
  return (
    <main className="lp2 lp2-grain min-h-screen overflow-x-hidden antialiased">
      <NavBar />
      <Hero />
      <MarqueeStrip />
      <BentoFeatures />
      <HowItWorks />
      <CodeShowcase />
      <QuoteSection />
      <FinalCta />
      <Footer />
    </main>
  );
}

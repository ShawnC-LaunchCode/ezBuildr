import "./landing-v2.css";

import BentoFeatures from "./components/BentoFeatures";
import { QuoteSection, FinalCtaV2, FooterV2 } from "./components/ClosingV2";
import CodeShowcase from "./components/CodeShowcase";
import HeroV2 from "./components/HeroV2";
import HowItWorks from "./components/HowItWorks";
import MarqueeStrip from "./components/MarqueeStrip";
import NavBarV2 from "./components/NavBarV2";

/**
 * Secondary marketing landing page ("The Logic Layer" concept).
 * Dark editorial look, fully self-contained under marketing/v2 —
 * the primary landing page at "/" is untouched.
 */
export default function LandingV2() {
  return (
    <main className="lp2 lp2-grain min-h-screen overflow-x-hidden antialiased">
      <NavBarV2 />
      <HeroV2 />
      <MarqueeStrip />
      <BentoFeatures />
      <HowItWorks />
      <CodeShowcase />
      <QuoteSection />
      <FinalCtaV2 />
      <FooterV2 />
    </main>
  );
}

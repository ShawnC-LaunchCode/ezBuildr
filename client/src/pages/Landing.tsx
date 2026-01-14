import { motion } from "framer-motion";
import {
  Workflow,
  Zap,
  Code2,
  Users,
  Variable,
  Puzzle,
  ArrowRight,
  Check,
  Play,
  GitBranch,
  Sparkles,
} from "lucide-react";

import logo from "@/assets/images/logo.png";
import { GoogleLogin } from "@/components/GoogleLogin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Landing() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Debug logging for Google Sign-In
  if (import.meta.env.DEV) {
    console.log('[Landing] Current Origin:', window.location.origin);
    console.log('[Landing] Google Client ID configured:', googleClientId ? 'Yes (Masked)' : 'No');
  }

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const stagger = {
    visible: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="Vault-Logic Logo"
                className="w-8 h-8 rounded-lg object-cover"
              />
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                ezBuildr
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="ghost" disabled className="opacity-50">
                Watch Demo (Coming Soon)
              </Button>
              <GoogleLogin data-testid="button-login" />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 -z-10">
          <motion.div
            className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full blur-3xl opacity-20"
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 90, 0],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            }}
          />
          <motion.div
            className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full blur-3xl opacity-20"
            animate={{
              scale: [1.2, 1, 1.2],
              rotate: [90, 0, 90],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="text-center"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-600">Logic-first workflow automation</span>
            </motion.div>

            <motion.h1
              variants={fadeIn}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground tracking-tight"
            >
              Automate your{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                thinking
              </span>
            </motion.h1>

            <motion.p
              variants={fadeIn}
              className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            >
              Build powerful workflows with conditional logic and optional code blocks.
              Start simple with drag-and-drop, or dive deep with custom JavaScript.
            </motion.p>

            <motion.div variants={fadeIn} className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              {googleClientId ? (
                <GoogleLogin data-testid="button-get-started" />
              ) : (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:opacity-90 text-white px-8"
                  onClick={() => window.location.href = '/api/auth/dev-login'}
                >
                  Start Building <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="group opacity-50"
                disabled
              >
                <Play className="mr-2 w-4 h-4" />
                Watch Demo (Coming Soon)
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* Floating cards animation */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-20 relative"
        >
          <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { label: "If-Then", icon: GitBranch, delay: 0.6 },
              { label: "Variables", icon: Variable, delay: 0.7 },
              { label: "JS Blocks", icon: Code2, delay: 0.8 },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: item.delay }}
                className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 text-center hover:border-indigo-500/50 transition-colors"
              >
                <item.icon className="w-8 h-8 mx-auto mb-2 text-indigo-600" />
                <p className="text-sm font-medium text-foreground">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </section>

      {/* Product Highlights */}
      <section className="py-24 bg-muted/30" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl font-bold text-foreground">
              Everything you need to build logic
            </motion.h2>
            <motion.p variants={fadeIn} className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              From simple flows to complex automations, Vault-Logic adapts to your needs
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {[
              {
                icon: Workflow,
                title: "Logic-First Design",
                description: "Build workflows around conditions and decisions, not just linear steps. Map your thinking naturally.",
                gradient: "from-indigo-500 to-violet-500",
              },
              {
                icon: Zap,
                title: "Easy / Advanced Mode",
                description: "Start with visual blocks, add complexity as needed. Switch modes seamlessly without losing work.",
                gradient: "from-violet-500 to-fuchsia-500",
              },
              {
                icon: Code2,
                title: "Custom JS Blocks",
                description: "When visual blocks aren't enough, drop in JavaScript. Full access to APIs, transformations, and logic.",
                gradient: "from-fuchsia-500 to-pink-500",
              },
              {
                icon: Users,
                title: "Projects & Teams",
                description: "Organize workflows into projects. Share with your team, control access, collaborate in real-time.",
                gradient: "from-indigo-500 to-blue-500",
              },
              {
                icon: Variable,
                title: "Variables & Aliases",
                description: "Store, transform, and reuse data throughout your flows. Type-safe variables with smart suggestions.",
                gradient: "from-blue-500 to-cyan-500",
              },
              {
                icon: Puzzle,
                title: "Future-Ready Integrations",
                description: "Built for extensibility. API-first architecture ready for webhooks, databases, and third-party services.",
                gradient: "from-cyan-500 to-teal-500",
              },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeIn}>
                <Card className="h-full border-border/50 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <div className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4 shadow-lg`}>
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Visual Split Section */}
      <section className="py-24" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
                Everything you need to model{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  real workflows
                </span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Most tools force you to choose: simple but limited, or powerful but complex.
                Vault-Logic gives you both. Start with drag-and-drop simplicity, add code when you need it.
              </p>
              <ul className="space-y-4">
                {[
                  "Visual builder for quick workflows",
                  "Conditional logic without complexity",
                  "JavaScript blocks for custom operations",
                  "Real-time preview and testing",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-indigo-600" />
                    </div>
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="aspect-video bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 rounded-2xl shadow-2xl flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/10" />
                <div className="relative z-10 text-white/80 text-center p-8">
                  <Workflow className="w-20 h-20 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Builder UI Placeholder</p>
                  <p className="text-xs mt-2 opacity-70">Visual workflow editor preview</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Vault-Logic - Comparison */}
      <section className="py-24 bg-muted/30" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Other tools stop at data collection
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground">
              Vault-Logic goes further — automating the decisions that come after
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              {
                title: "No-Code Creators",
                description: "You don't need to code, but you need real logic",
                features: [
                  "Visual if-then-else flows",
                  "No coding required to start",
                  "Upgrade to code when ready",
                  "Templates and presets",
                ],
              },
              {
                title: "Developers",
                description: "You want power without rebuilding everything",
                features: [
                  "Custom JavaScript blocks",
                  "API integrations ready",
                  "Version control friendly",
                  "Export and import flows",
                ],
                highlight: true,
              },
              {
                title: "Teams",
                description: "You need collaboration without chaos",
                features: [
                  "Project organization",
                  "Role-based access",
                  "Shared workflows",
                  "Activity tracking",
                ],
              },
            ].map((audience, i) => (
              <motion.div key={i} variants={fadeIn}>
                <Card
                  className={`h-full ${audience.highlight
                    ? "border-2 border-indigo-500 shadow-xl shadow-indigo-500/20 bg-gradient-to-b from-indigo-500/5 to-transparent"
                    : "border-border/50 bg-card/50 backdrop-blur-sm"
                    }`}
                >
                  <CardHeader>
                    <CardTitle className="text-2xl">{audience.title}</CardTitle>
                    <CardDescription className="text-base">
                      {audience.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {audience.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Quick Demo Section */}
      <section className="py-24" >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 rounded-3xl p-12 text-center text-white relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-grid-white/10" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                See it in action
              </h2>
              <p className="text-lg mb-8 text-white/90 max-w-2xl mx-auto">
                Build your first logic flow in 60 seconds. No credit card required.
              </p>
              <Button
                size="lg"
                variant="secondary"
                className="bg-white text-indigo-600 px-8 opacity-50"
                disabled
              >
                <Play className="mr-2 w-5 h-5" />
                Watch Demo Video (Coming Soon)
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-muted/30" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeIn} className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Simple, transparent pricing
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-muted-foreground">
              Start free, upgrade when you need more power
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto"
          >
            {[
              {
                name: "Creator",
                price: "Free",
                description: "Perfect for individuals and small projects",
                features: [
                  "Unlimited workflows",
                  "Easy mode builder",
                  "Basic conditional logic",
                  "Community support",
                  "Export capabilities",
                ],
                cta: "Start Building",
              },
              {
                name: "Team Pro",
                price: "$49",
                period: "/month",
                description: "For teams that need advanced features",
                features: [
                  "Everything in Creator",
                  "Custom JavaScript blocks",
                  "Advanced mode",
                  "Team collaboration",
                  "Priority support",
                  "API access",
                ],
                cta: "Get Started",
                highlight: true,
              },
            ].map((plan, i) => (
              <motion.div key={i} variants={fadeIn}>
                <Card
                  className={`h-full ${plan.highlight
                    ? "border-2 border-indigo-500 shadow-xl shadow-indigo-500/20 bg-gradient-to-b from-indigo-500/5 to-transparent"
                    : "border-border/50 bg-card/50 backdrop-blur-sm"
                    }`}
                >
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                    <div className="mb-4">
                      <span className="text-5xl font-bold text-foreground">{plan.price}</span>
                      {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                    </div>
                    <CardDescription className="text-base">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                          <span className="text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={`w-full ${plan.highlight
                        ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:opacity-90 text-white"
                        : ""
                        }`}
                      variant={plan.highlight ? "default" : "outline"}
                      size="lg"
                      onClick={() => window.location.href = '/app'}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-24" >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-6">
              Ready to automate your{" "}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                thinking?
              </span>
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join teams building smarter workflows with Vault-Logic
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {googleClientId ? (
                <GoogleLogin data-testid="button-cta-start" />
              ) : (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:opacity-90 text-white px-8"
                  onClick={() => window.location.href = '/app'}
                >
                  Start Building Free <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                disabled
                className="opacity-50"
              >
                Watch Demo (Coming Soon)
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 bg-muted/20" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/app" className="hover:text-foreground transition-colors">Features</a></li>
                <li><span className="opacity-50 cursor-not-allowed">Demo (Coming Soon)</span></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/app" className="hover:text-foreground transition-colors">Documentation</a></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">Tutorials</a></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/app" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/app" className="hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="/app" className="hover:text-foreground transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border/40 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-3">
              <img
                src={logo}
                alt="Vault-Logic Logo"
                className="w-6 h-6 rounded-lg object-cover"
              />
              <span className="text-sm text-muted-foreground">
                © 2025 Vault-Logic. All rights reserved.
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              Built with <span className="text-red-500">♥</span> for workflow automation
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

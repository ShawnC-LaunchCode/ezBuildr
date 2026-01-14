/**
 * Stage 17: Intake Demo Component
 *
 * Demonstration of themed intake portal components
 * Useful for preview and testing
 */

import React, { useState } from 'react';

import IntakeLayout from './IntakeLayout';
import IntakeProgressBar from './IntakeProgressBar';
import ThemedButton from './ThemedButton';
import { ThemedInput, ThemedTextarea } from './ThemedInput';

export interface IntakeDemoProps {
  /** Custom header text */
  headerText?: string;

  /** Custom logo URL */
  logoUrl?: string;
}

/**
 * Demo intake portal showing all themed components
 *
 * Use this with BrandingProvider to see branding in action:
 * ```tsx
 * <BrandingProvider tenantId={tenantId} enableTheming={true}>
 *   <IntakeDemo />
 * </BrandingProvider>
 * ```
 */
export default function IntakeDemo({ headerText, logoUrl }: IntakeDemoProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  const totalSteps = 3;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Form submitted! (This is a demo)');
  };

  return (
    <IntakeLayout headerText={headerText} logoUrl={logoUrl}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress Bar */}
        <IntakeProgressBar
          currentStep={currentStep}
          totalSteps={totalSteps}
          showPercentage={true}
          showStepCount={true}
          className="mb-8"
        />

        {/* Form Steps */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ color: 'var(--brand-heading, #0F172A)' }}
                >
                  Personal Information
                </h2>
                <p style={{ color: 'var(--brand-text-muted, #64748B)' }}>
                  Please provide your basic information
                </p>
              </div>

              <ThemedInput
                label="Full Name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                showRequired
              />

              <ThemedInput
                label="Email Address"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                helperText="We'll never share your email with anyone else"
                showRequired
              />

              <ThemedInput
                label="Phone Number"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          )}

          {/* Step 2: Additional Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ color: 'var(--brand-heading, #0F172A)' }}
                >
                  Additional Details
                </h2>
                <p style={{ color: 'var(--brand-text-muted, #64748B)' }}>
                  Tell us more about your needs
                </p>
              </div>

              <ThemedTextarea
                label="Message"
                placeholder="Please describe your inquiry..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={6}
                helperText="Provide as much detail as possible"
                showRequired
              />

              {/* Example of multiple choice */}
              <div className="space-y-3">
                <label
                  className="block text-sm font-medium"
                  style={{ color: 'var(--brand-text, #0F172A)' }}
                >
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {['Search Engine', 'Social Media', 'Referral', 'Other'].map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 cursor-pointer"
                      style={{ color: 'var(--brand-text, #0F172A)' }}
                    >
                      <input
                        type="radio"
                        name="source"
                        value={option}
                        className="h-4 w-4"
                        style={{ accentColor: 'var(--brand-primary, #3B82F6)' }}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2
                  className="text-2xl font-bold mb-2"
                  style={{ color: 'var(--brand-heading, #0F172A)' }}
                >
                  Review & Submit
                </h2>
                <p style={{ color: 'var(--brand-text-muted, #64748B)' }}>
                  Please review your information before submitting
                </p>
              </div>

              <div
                className="p-6 rounded-lg space-y-4"
                style={{
                  backgroundColor: 'var(--brand-surface, #FFFFFF)',
                  border: '1px solid var(--brand-border, #E2E8F0)',
                }}
              >
                <div>
                  <p
                    className="text-sm font-medium mb-1"
                    style={{ color: 'var(--brand-text-muted, #64748B)' }}
                  >
                    Full Name
                  </p>
                  <p style={{ color: 'var(--brand-text, #0F172A)' }}>
                    {formData.name || '(Not provided)'}
                  </p>
                </div>

                <div>
                  <p
                    className="text-sm font-medium mb-1"
                    style={{ color: 'var(--brand-text-muted, #64748B)' }}
                  >
                    Email Address
                  </p>
                  <p style={{ color: 'var(--brand-text, #0F172A)' }}>
                    {formData.email || '(Not provided)'}
                  </p>
                </div>

                {formData.phone && (
                  <div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: 'var(--brand-text-muted, #64748B)' }}
                    >
                      Phone Number
                    </p>
                    <p style={{ color: 'var(--brand-text, #0F172A)' }}>{formData.phone}</p>
                  </div>
                )}

                <div>
                  <p
                    className="text-sm font-medium mb-1"
                    style={{ color: 'var(--brand-text-muted, #64748B)' }}
                  >
                    Message
                  </p>
                  <p style={{ color: 'var(--brand-text, #0F172A)' }}>
                    {formData.message || '(Not provided)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center gap-3 pt-4">
            {currentStep > 1 && (
              <ThemedButton
                type="button"
                variant="secondary"
                onClick={handlePrevious}
                className="flex-1"
              >
                Previous
              </ThemedButton>
            )}

            {currentStep < totalSteps ? (
              <ThemedButton
                type="button"
                variant="primary"
                onClick={handleNext}
                className="flex-1"
              >
                Next
              </ThemedButton>
            ) : (
              <ThemedButton
                type="submit"
                variant="accent"
                className="flex-1"
              >
                Submit
              </ThemedButton>
            )}
          </div>

          {/* Additional Button Examples */}
          {currentStep === 1 && (
            <div className="pt-6 space-y-3">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--brand-text-muted, #64748B)' }}
              >
                Button Variants (Demo):
              </p>
              <div className="flex flex-wrap gap-2">
                <ThemedButton variant="primary" size="sm">
                  Primary
                </ThemedButton>
                <ThemedButton variant="secondary" size="sm">
                  Secondary
                </ThemedButton>
                <ThemedButton variant="accent" size="sm">
                  Accent
                </ThemedButton>
                <ThemedButton variant="outline" size="sm">
                  Outline
                </ThemedButton>
                <ThemedButton variant="ghost" size="sm">
                  Ghost
                </ThemedButton>
              </div>
            </div>
          )}
        </form>
      </div>
    </IntakeLayout>
  );
}

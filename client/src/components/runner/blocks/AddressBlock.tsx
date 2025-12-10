/**
 * AddressBlockRenderer - Address Input
 *
 * Features:
 * - Structured US address fields (street, city, state, zip)
 * - State dropdown (50 US states)
 * - Required validation per field
 *
 * Storage Format (nested JSON under step.alias):
 * {
 *   street: "123 Main St",
 *   city: "Miami",
 *   state: "FL",
 *   zip: "33101"
 * }
 */

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Step } from "@/types";
import type { AddressConfig, AddressValue } from "@/../../shared/types/stepConfigs";

// US States
const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export interface AddressBlockProps {
  step: Step;
  value: any;
  onChange: (value: AddressValue) => void;
  readOnly?: boolean;
}

export function AddressBlockRenderer({ step, value, onChange, readOnly }: AddressBlockProps) {
  const config = step.config as AddressConfig;

  // Parse current value (nested object)
  const currentValue: AddressValue = value || {};

  // Update a single field
  const updateField = (field: keyof AddressValue, newValue: string) => {
    onChange({
      ...currentValue,
      [field]: newValue,
    });
  };

  return (
    <div className="space-y-3">
      {/* Street */}
      <div className="space-y-1">
        <Label htmlFor={`${step.id}-street`} className="text-sm">
          Street Address
        </Label>
        <Input
          id={`${step.id}-street`}
          type="text"
          value={currentValue.street || ""}
          onChange={(e) => updateField("street", e.target.value)}
          placeholder="123 Main St"
          disabled={readOnly}
        />
      </div>

      {/* City */}
      <div className="space-y-1">
        <Label htmlFor={`${step.id}-city`} className="text-sm">
          City
        </Label>
        <Input
          id={`${step.id}-city`}
          type="text"
          value={currentValue.city || ""}
          onChange={(e) => updateField("city", e.target.value)}
          placeholder="Miami"
          disabled={readOnly}
        />
      </div>

      {/* State & ZIP (side by side) */}
      <div className="grid grid-cols-2 gap-3">
        {/* State */}
        <div className="space-y-1">
          <Label htmlFor={`${step.id}-state`} className="text-sm">
            State
          </Label>
          <Select
            value={currentValue.state || ""}
            onValueChange={(newValue) => updateField("state", newValue)}
            disabled={readOnly}
          >
            <SelectTrigger id={`${step.id}-state`}>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ZIP */}
        <div className="space-y-1">
          <Label htmlFor={`${step.id}-zip`} className="text-sm">
            ZIP Code
          </Label>
          <Input
            id={`${step.id}-zip`}
            type="text"
            value={currentValue.zip || ""}
            onChange={(e) => updateField("zip", e.target.value)}
            placeholder="33101"
            maxLength={5}
            disabled={readOnly}
          />
        </div>
      </div>
    </div>
  );
}

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


import { Loader2, MapPin } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";

// Removed wouter hooks to safely handle URLs without re-renders
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreviewStore } from "@/store/preview";
import type { Step } from "@/types";

import type { AddressConfig, AddressValue } from "@/../../shared/types/stepConfigs";

// Import store to get access to preview tokens

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

interface Suggestion {
  description: string;
  place_id: string;
}

export function AddressBlockRenderer({ step, value, onChange, readOnly }: AddressBlockProps) {
  const config = step.config as AddressConfig;

  // Parse current value (nested object)
  const currentValue: AddressValue = value || {};

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [shouldFetch, setShouldFetch] = useState(true); // Prevent fetching when selecting an item
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.debug("[AddressBlock] Geolocation denied or failed", error);
        }
      );
    }
  }, []);


  // Helper to get auth headers
  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 1. Check for token in query params (often used in preview/iframe)
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token');
    if (queryToken) {
      headers["Authorization"] = `Bearer ${queryToken}`;
      return headers;
    }

    // 2. Check for Run ID in URL path and match with store
    // URL patterns: /run/:id, /preview/:id
    const pathParts = window.location.pathname.split('/');
    const storeState = usePreviewStore.getState();
    const knownTokens = storeState.tokens || {};

    // Iterate through path parts to find a UUID-like string that matches a known run
    for (const part of pathParts) {
      // Check store first (most reliable for preview)
      if (knownTokens[part]) {
        headers["Authorization"] = `Bearer ${knownTokens[part]}`;
        return headers;
      }
      // Check localStorage as fallback
      const localToken = localStorage.getItem(`run_token_${part}`);
      if (localToken) {
        headers["Authorization"] = `Bearer ${localToken}`;
        return headers;
      }
    }

    // 3. Fallback: Check if there's any active run token in localStorage if we can't find ID
    // (This is a "Hail Mary" - maybe only one run exists?)
    // Skipping for safety to avoid sending wrong token.

    return headers;
  };

  // Update a single field
  const updateField = (field: keyof AddressValue, newValue: string) => {
    onChange({
      ...currentValue,
      [field]: newValue,
    });
  };

  // Debounce search
  useEffect(() => {
    if (!shouldFetch || !currentValue.street || currentValue.street.length <= 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const headers = getHeaders();
        let url = `/api/places/autocomplete?input=${encodeURIComponent(currentValue.street!)}`;

        if (userLocation) {
          url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=50000`; // 50km radius bias
        }

        const res = await fetch(url, {
          headers
        });

        if (res.status === 401) {
          console.warn("[AddressBlock] Unauthorized. Please Ensure you are logged in or have a valid session.");
          return;
        }

        const data = await res.json();

        if (Array.isArray(data)) {
          setSuggestions(data);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("[AddressBlock] Autocomplete fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [currentValue.street, shouldFetch]);

  const handleStreetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShouldFetch(true);
    updateField("street", e.target.value);
  };

  const handleSelectSuggestion = async (placeId: string) => {
    setLoading(true);
    setShowSuggestions(false);
    setShouldFetch(false); // Don't search again for the filled value
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/places/details?placeId=${placeId}`, {
        headers
      });
      const data = await res.json();

      if (data?.address_components) {
        // Parse address components
        let streetNum = "";
        let route = "";
        let city = "";
        let state = "";
        let zip = "";

        data.address_components.forEach((comp: any) => {
          if (comp.types.includes("street_number")) {streetNum = comp.long_name;}
          if (comp.types.includes("route")) {route = comp.long_name;}
          if (comp.types.includes("locality")) {city = comp.long_name;}
          // If locality is missing, try sublocality or neighborhood? usually locality is city.
          if (!city && comp.types.includes("sublocality")) {city = comp.long_name;}

          if (comp.types.includes("administrative_area_level_1")) {state = comp.short_name;}
          if (comp.types.includes("postal_code")) {zip = comp.long_name;}
        });

        onChange({
          street: `${streetNum} ${route}`.trim(),
          city,
          state,
          zip
        });
      }
    } catch (err) {
      console.error("Failed to get details", err);
    } finally {
      setLoading(false);
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);


  return (
    <div className="space-y-3" ref={wrapperRef}>
      {/* Street */}
      <div className="space-y-1 relative">
        <Label htmlFor={`${step.id}-street`} className="text-sm">
          Street Address
        </Label>
        {/* Suggestions Popover */}
        <div className="relative">
          <Popover open={showSuggestions && suggestions.length > 0} onOpenChange={setShowSuggestions}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Input
                  id={`${step.id}-street`}
                  type="text"
                  value={currentValue.street || ""}
                  onChange={handleStreetChange}
                  placeholder="123 Main St"
                  disabled={readOnly}
                  className="w-full"
                  autoComplete="chrome-off"
                  data-1p-ignore // Ignore 1Password
                  data-lpignore="true" // Ignore LastPass
                  onFocus={() => {
                    if (suggestions.length > 0) {setShowSuggestions(true);}
                  }}
                />
                {loading && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {suggestions.map((suggestion) => (
                      <CommandItem
                        key={suggestion.place_id}
                        value={suggestion.description}
                        onSelect={() => handleSelectSuggestion(suggestion.place_id)}
                      >
                        <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                        {suggestion.description}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
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

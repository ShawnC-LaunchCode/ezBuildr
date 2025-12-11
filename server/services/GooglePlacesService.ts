
import { logger } from "../lib/observability/logger";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DISALLOWED_TYPES = ['premise', 'subpremise', 'room', 'floor', 'post_box'];

interface PlacePrediction {
    description: string;
    place_id: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
    types: string[];
}

interface PlaceDetails {
    place_id: string;
    formatted_address: string;
    address_components: {
        long_name: string;
        short_name: string;
        types: string[];
    }[];
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
}

export class GooglePlacesService {
    /**
     * Get autocomplete suggestions from Google Places API
     * @param input User input string
     * @returns List of predictions
     */
    /**
     * Get autocomplete suggestions from Google Places API
     * @param input User input string
     * @param lat Optional latitude for location bias
     * @param lng Optional longitude for location bias
     * @param radius Optional radius for location bias
     * @returns List of predictions
     */
    async getAutocompleteSuggestions(input: string, lat?: number, lng?: number, radius?: number): Promise<PlacePrediction[]> {
        if (!GOOGLE_PLACES_API_KEY) {
            logger.warn("GOOGLE_PLACES_API_KEY is not set");
            return [];
        }

        if (!input || input.length < 3) {
            return [];
        }

        try {
            // Removed types=address to be more broad
            let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
                input
            )}&key=${GOOGLE_PLACES_API_KEY}`;

            if (lat && lng && radius) {
                url += `&location=${lat},${lng}&radius=${radius}`;
            }

            // Log the request (masking key)
            // logger.info({ url: url.replace(GOOGLE_PLACES_API_KEY, '***') }, "Calling Google Places API");

            const response = await fetch(url);
            const data = await response.json();

            // logger.info({ status: data.status, prediction_count: data.predictions?.length }, "Google Places Response");

            if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
                logger.error({ status: data.status, error_message: data.error_message }, "Google Places Autocomplete API error");
                throw new Error(`Google Places API error: ${data.status}`);
            }

            // Return all predictions without filtering
            const results = data.predictions || [];

            return results;
        } catch (error) {
            logger.error({ err: error }, "Failed to fetch autocomplete suggestions");
            throw error;
        }
    }

    /**
     * Get place details (address components) from Google Places API
     * @param placeId Google Place ID
     * @returns Structured address details
     */
    async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
        if (!GOOGLE_PLACES_API_KEY) {
            logger.warn("GOOGLE_PLACES_API_KEY is not set");
            return null;
        }

        try {
            // Request specific fields to save costs/bandwidth
            const fields = "address_component,formatted_address,geometry,place_id";
            const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_PLACES_API_KEY}`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== "OK") {
                logger.error({ status: data.status, error_message: data.error_message }, "Google Places Details API error");
                throw new Error(`Google Places API error: ${data.status}`);
            }

            return data.result as PlaceDetails;
        } catch (error) {
            logger.error({ err: error }, "Failed to fetch place details");
            throw error;
        }
    }
}

export const googlePlacesService = new GooglePlacesService();

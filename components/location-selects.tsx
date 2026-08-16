"use client";

import { useState } from "react";
import { getCitiesForState, indianLocations } from "@/lib/location-options";

const customCityValue = "__custom_city__";

export function LocationSelects({
  state,
  city,
  onStateChange,
  onCityChange,
  required = true,
}: {
  state: string;
  city: string;
  onStateChange: (value: string) => void;
  onCityChange: (value: string) => void;
  required?: boolean;
}) {
  const cities = getCitiesForState(state);
  const [customCitySelected, setCustomCitySelected] = useState(false);
  const customCity = customCitySelected || Boolean(state && city && !cities.includes(city));

  return (
    <div className="location-select-grid">
      <label className="field">
        State
        <select
          value={state}
          onChange={(event) => {
            onStateChange(event.target.value);
            onCityChange("");
            setCustomCitySelected(false);
          }}
          required={required}
        >
          <option value="">Select state</option>
          {indianLocations.map((item) => <option value={item.state} key={item.state}>{item.state}</option>)}
        </select>
      </label>
      <label className="field">
        City
        <select
          value={customCity ? customCityValue : city}
          onChange={(event) => {
            if (event.target.value === customCityValue) {
              setCustomCitySelected(true);
              onCityChange("");
              return;
            }
            setCustomCitySelected(false);
            onCityChange(event.target.value);
          }}
          disabled={!state}
          required={required}
        >
          <option value="">Select city</option>
          {cities.map((item) => <option value={item} key={item}>{item}</option>)}
          <option value={customCityValue}>Other city</option>
        </select>
      </label>
      {customCity && (
        <label className="field location-custom-city">
          City name
          <input value={city} onChange={(event) => onCityChange(event.target.value)} placeholder="Type your city" required={required} maxLength={80} />
        </label>
      )}
    </div>
  );
}

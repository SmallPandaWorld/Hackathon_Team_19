"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

export type MapPin = {
  id: number;
  lat: number;
  lng: number;
  label: string;
  icon?: string;
  done?: boolean;
};

type Props = {
  pins: MapPin[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  // Editor mode: tapping the map reports the tapped coordinates.
  onPick?: (lat: number, lng: number) => void;
  className?: string;
};

// ETH Zentrum: main building and Polyterrasse.
const ETH_CENTER: [number, number] = [47.3764, 8.5473];
const DEFAULT_ZOOM = 17;

// Standard OpenStreetMap tiles: free, no API key (fine for event-sized use,
// see https://operations.osmfoundation.org/policies/tiles/). In dark mode a
// CSS filter darkens them (globals.css), so no second tile source is needed.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// VIS-style pin: yellow with a dark outline; completed quests turn dark with
// a yellow check.
function pinHtml(pin: MapPin, selected: boolean) {
  const fill = pin.done ? "#181c22" : "#ffe210";
  const symbol = pin.done
    ? '<span style="color:#ffe210;font-weight:800">✓</span>'
    : escapeHtml(pin.icon ?? "★");
  return `
    <div style="position:relative;width:34px;height:44px;transform-origin:50% 100%;transform:scale(${selected ? 1.25 : 1});transition:transform .15s;filter:drop-shadow(0 2px 2px rgb(0 0 0 / .35))">
      <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 42.5S31.5 27.8 31.5 17A14.5 14.5 0 0 0 2.5 17C2.5 27.8 17 42.5 17 42.5z"
          fill="${fill}" stroke="${pin.done ? "#ffe210" : "#181c22"}" stroke-width="2.5"/>
      </svg>
      <span style="position:absolute;top:6px;left:0;width:34px;text-align:center;font-size:15px;line-height:20px">${symbol}</span>
    </div>`;
}

export function CampusMap({
  pins,
  selectedId,
  onSelect,
  onPick,
  className = "h-[60vh] min-h-80",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const meRef = useRef<Leaflet.CircleMarker | null>(null);
  const fittedRef = useRef(false);
  // Latest callbacks, so the map isn't rebuilt when they change.
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onPickRef.current = onPick;
  });
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Create the map once. Leaflet needs `window`, so it's loaded on the client.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      // Fractional zoom lets the map frame nearby pins tightly enough that
      // the Polyterrasse quests don't overlap.
      const map = L.map(containerRef.current, {
        zoomControl: true,
        zoomSnap: 0.25,
      }).setView(ETH_CENTER, DEFAULT_ZOOM);
      L.tileLayer(TILE_URL, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        className: "osm-tiles",
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        onPickRef.current?.(
          Math.round(event.latlng.lat * 1e6) / 1e6,
          Math.round(event.latlng.lng * 1e6) / 1e6,
        );
      });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw the pins.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    for (const pin of pins) {
      const selected = pin.id === selectedId;
      L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({
          className: "quest-pin",
          html: pinHtml(pin, selected),
          iconSize: [34, 44],
          iconAnchor: [17, 43],
        }),
        title: pin.label,
        alt: pin.label,
        keyboard: true,
        zIndexOffset: selected ? 1000 : 0,
      })
        .on("click", () => onSelectRef.current?.(pin.id))
        .addTo(layer);
    }

    // Frame the pins once, when they first arrive.
    if (!fittedRef.current && pins.length > 0) {
      fittedRef.current = true;
      if (pins.length === 1) {
        map.setView([pins[0].lat, pins[0].lng], 18);
      } else {
        map.fitBounds(
          L.latLngBounds(
            pins.map((pin) => [pin.lat, pin.lng] as [number, number]),
          ),
          { padding: [36, 36], maxZoom: 18.5 },
        );
      }
    }
  }, [pins, selectedId, ready]);

  // Keep the selected pin in view (not in the editor, where pins follow taps).
  useEffect(() => {
    const pin = pins.find((p) => p.id === selectedId);
    if (ready && pin && mapRef.current && !onPickRef.current) {
      mapRef.current.panTo([pin.lat, pin.lng], { animate: true });
    }
  }, [selectedId, pins, ready]);

  function locateMe() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!navigator.geolocation) {
      setLocateError("Your browser can't share your location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const here: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        meRef.current?.remove();
        meRef.current = L.circleMarker(here, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#215caf",
          fillOpacity: 1,
        })
          .bindTooltip("You are here")
          .addTo(map);
        map.flyTo(here, Math.max(map.getZoom(), 17));
      },
      () => {
        setLocating(false);
        setLocateError(
          "Location unavailable. Allow location access to see where you are.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="relative isolate">
      <div
        aria-label="Map of ETH Zentrum with quest locations"
        className={`isolate w-full overflow-hidden rounded-lg border border-outline-variant ${
          onPick ? "cursor-crosshair" : ""
        } ${className}`}
        ref={containerRef}
        role="region"
      />
      <button
        aria-label="Show my location"
        className="absolute right-3 top-3 z-[1000] rounded-sm border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-variant disabled:opacity-60"
        disabled={!ready || locating}
        onClick={locateMe}
        type="button"
      >
        {locating ? "Locating…" : "◎ Where am I?"}
      </button>
      {locateError && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {locateError}
        </p>
      )}
    </div>
  );
}

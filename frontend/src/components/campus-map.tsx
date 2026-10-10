"use client";

import "leaflet/dist/leaflet.css";
import { KIND_ICONS } from "@/src/components/icons";
import type { QuestOutKind } from "@/src/lib/api/hackathon.schemas";
import type * as Leaflet from "leaflet";
import { Check, LocateFixed, MapPin as MapPinIcon } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind?: QuestOutKind;
  done?: boolean;
};

type Props = {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
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

// Leaflet markers take HTML strings, so the Lucide icons are rendered to
// static SVG markup once per icon.
const iconMarkup = new Map<string, string>();
function pinSymbol(pin: MapPin) {
  const key = pin.done ? "done" : (pin.kind ?? "pin");
  let markup = iconMarkup.get(key);
  if (!markup) {
    const icon = pin.done
      ? Check
      : pin.kind
        ? KIND_ICONS[pin.kind]
        : MapPinIcon;
    markup = renderToStaticMarkup(
      createElement(icon, {
        size: 16,
        strokeWidth: pin.done ? 3 : 2.25,
        // Coloured by the wrapper (see pinHtml), so pins follow the theme.
        color: "currentColor",
        "aria-hidden": true,
      }),
    );
    iconMarkup.set(key, markup);
  }
  return markup;
}

// Teal pin with a dark outline; completed quests turn light gold with a
// check. Colours are theme tokens, set via style (SVG presentation
// attributes don't resolve var()).
function pinHtml(pin: MapPin, selected: boolean) {
  const fill = pin.done ? "var(--accent)" : "var(--primary)";
  const ink = pin.done ? "var(--on-accent)" : "var(--on-primary)";
  const symbol = pinSymbol(pin);
  return `
    <div style="position:relative;width:34px;height:44px;transform-origin:50% 100%;transform:scale(${selected ? 1.25 : 1});transition:transform .15s;filter:drop-shadow(0 2px 2px rgb(58 35 48 / .35))">
      <svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 42.5S31.5 27.8 31.5 17A14.5 14.5 0 0 0 2.5 17C2.5 27.8 17 42.5 17 42.5z"
          style="fill:${fill};stroke:${ink}" stroke-width="2"/>
      </svg>
      <span style="position:absolute;top:9px;left:0;width:34px;display:flex;justify-content:center;color:${ink}">${symbol}</span>
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
  // The live Leaflet map. Kept in state (not just a ref) so that pins are
  // redrawn whenever a new map is created: with cacheComponents, Next.js
  // hides pages in <Activity> instead of unmounting them, so effects re-run
  // on return while other state survives.
  const [map, setMap] = useState<Leaflet.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Create the map once. Leaflet needs `window`, so it's loaded on the client.
  useEffect(() => {
    let cancelled = false;
    let created: Leaflet.Map | null = null;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      // Fractional zoom lets the map frame nearby pins tightly enough that
      // the Polyterrasse quests don't overlap.
      created = L.map(containerRef.current, {
        zoomControl: true,
        zoomSnap: 0.25,
      }).setView(ETH_CENTER, DEFAULT_ZOOM);
      L.tileLayer(TILE_URL, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        className: "osm-tiles",
      }).addTo(created);

      markersRef.current = L.layerGroup().addTo(created);
      created.on("click", (event: Leaflet.LeafletMouseEvent) => {
        onPickRef.current?.(
          Math.round(event.latlng.lat * 1e6) / 1e6,
          Math.round(event.latlng.lng * 1e6) / 1e6,
        );
      });
      setMap(created);
    });
    return () => {
      cancelled = true;
      // Remove synchronously: React defers state updates of hidden pages, and
      // Leaflet can't create a new map on a container that still has one.
      created?.remove();
      setMap(null);
      markersRef.current = null;
      meRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Draw the pins.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = markersRef.current;
    if (!map || !L || !layer) return;

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
  }, [pins, selectedId, map]);

  // Keep the selected pin in view (not in the editor, where pins follow taps).
  useEffect(() => {
    const pin = pins.find((p) => p.id === selectedId);
    if (map && pin && !onPickRef.current) {
      map.panTo([pin.lat, pin.lng], { animate: true });
    }
  }, [selectedId, pins, map]);

  function locateMe() {
    const L = leafletRef.current;
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
          // Leaflet sets these as SVG attributes, so palette values, not var().
          color: "#ffffff",
          weight: 3,
          fillColor: "#167366", // dark teal (--link)
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
        className={`isolate w-full overflow-hidden rounded-2xl border border-outline-variant ${
          onPick ? "cursor-crosshair" : ""
        } ${className}`}
        ref={containerRef}
        role="region"
      />
      <button
        aria-label="Show my location"
        className="absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold text-on-surface shadow-card transition hover:bg-surface-variant disabled:opacity-60"
        disabled={!map || locating}
        onClick={locateMe}
        type="button"
      >
        <LocateFixed aria-hidden className="h-4 w-4" />
        {locating ? "Locating…" : "Where am I?"}
      </button>
      {locateError && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {locateError}
        </p>
      )}
    </div>
  );
}

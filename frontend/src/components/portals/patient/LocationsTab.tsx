// ===== Patient LocationsTab =====
//
// Lists every active facility for the patient's practice. Shows
// address, phone, hours, and services offered. Each card includes
// a "Get directions" link that opens Google Maps with the address
// (works on every device — falls back to web map if no native app).

import { useEffect, useState } from "react";
import { MapPin, Phone, Mail, Clock, Building2, ExternalLink, Star } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  // hours is { mon: ["09:00","17:00"], tue: [...] } or null
  hours: Record<string, [string, string]> | null;
  services: string[] | null;
  lat: number | string | null;
  lng: number | string | null;
  is_primary?: boolean;
  isPrimary?: boolean;
}

const DAY_LABELS: Array<[keyof Record<string, [string, string]>, string]> = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
];

export function LocationsTab() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await apiFetch<any>("/me/facilities");
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = Array.isArray(res.data) ? res.data : (res.data as any)?.data ?? [];
      setFacilities(items);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-5 animate-pulse bg-white">
            <div className="h-5 w-48 bg-slate-100 rounded mb-3" />
            <div className="h-4 w-64 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">Couldn't load locations: {error}</p>
      </div>
    );
  }

  if (facilities.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
        <Building2 className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <p className="text-sm font-medium text-slate-700">No locations on file yet</p>
        <p className="text-xs text-slate-500 mt-1">Your practice hasn't published their facility addresses.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {facilities.map((f) => <FacilityCard key={f.id} facility={f} />)}
    </div>
  );
}

function FacilityCard({ facility }: { facility: Facility }) {
  const isPrimary = facility.isPrimary ?? facility.is_primary ?? false;
  const fullAddress = [
    facility.address,
    facility.city,
    [facility.state, facility.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const directionsUrl = fullAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">{facility.name}</h3>
            {isPrimary && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                <Star className="w-3 h-3 fill-current" /> Primary
              </span>
            )}
          </div>
          {fullAddress && (
            <p className="text-sm text-slate-500 mt-1 flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{fullAddress}</span>
            </p>
          )}
        </div>
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 flex-shrink-0"
          >
            Directions <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Contact */}
      {(facility.phone || facility.email) && (
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {facility.phone && (
            <a href={`tel:${facility.phone}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-indigo-700">
              <Phone className="w-3.5 h-3.5" /> {facility.phone}
            </a>
          )}
          {facility.email && (
            <a href={`mailto:${facility.email}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-indigo-700">
              <Mail className="w-3.5 h-3.5" /> {facility.email}
            </a>
          )}
        </div>
      )}

      {/* Hours */}
      {facility.hours && Object.keys(facility.hours).length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Hours
          </p>
          <ul className="space-y-1 text-sm">
            {DAY_LABELS.map(([key, label]) => {
              const range = facility.hours?.[key as string];
              return (
                <li key={key as string} className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-500 w-12">{label}</span>
                  <span className="text-slate-700 font-medium tabular-nums">
                    {range && range[0] && range[1] ? `${range[0]} – ${range[1]}` : "Closed"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Services */}
      {facility.services && facility.services.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Services</p>
          <div className="flex flex-wrap gap-1.5">
            {facility.services.map((s) => (
              <span key={s} className="inline-block px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: "#f0fdfa", color: "#0c6b58" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

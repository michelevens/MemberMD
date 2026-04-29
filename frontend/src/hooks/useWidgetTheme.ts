// ===== useWidgetTheme =====
// Fetch the public theme for a tenantCode and apply CSS variables + custom CSS
// to the document root. Used by EnrollmentWidget, PlanWidget, and any other
// public-facing widget surface.
//
// Also fires an "impression" event when the hook mounts (best-effort, never
// blocks rendering).

import { useEffect, useState } from "react";
import {
  fetchPublicWidgetTheme,
  widgetAnalyticsService,
  type PublicWidgetTheme,
  type WidgetThemeScope,
} from "../lib/api";

const THEME_STYLE_ELEMENT_ID = "membermd-widget-theme";
const CUSTOM_CSS_ELEMENT_ID = "membermd-widget-custom-css";

export function useWidgetTheme(
  tenantCode: string | undefined,
  scope: WidgetThemeScope = "all",
  options: { trackImpression?: { widgetType: "enrollment" | "plans" | "booking" } } = {},
): { theme: PublicWidgetTheme | null; loading: boolean } {
  const [theme, setTheme] = useState<PublicWidgetTheme | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const t = await fetchPublicWidgetTheme(tenantCode, scope);
      if (cancelled) return;
      setTheme(t);
      if (t) applyTheme(t);
      setLoading(false);

      // Best-effort impression tracking — runs once per mount
      if (options.trackImpression) {
        await widgetAnalyticsService.trackEvent(
          tenantCode,
          options.trackImpression.widgetType,
          "impression",
          { sessionId: getSessionId() },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantCode, scope]);

  return { theme, loading };
}

function applyTheme(theme: PublicWidgetTheme) {
  // CSS variables → :root
  const cssVars = Object.entries(theme.cssVariables)
    .map(([k, v]) => `--mm-${k.replace(/_/g, "-")}: ${v};`)
    .join("\n");

  let varStyle = document.getElementById(THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!varStyle) {
    varStyle = document.createElement("style");
    varStyle.id = THEME_STYLE_ELEMENT_ID;
    document.head.appendChild(varStyle);
  }
  varStyle.textContent = `:root {\n${cssVars}\n}\n${theme.fontFamily ? `body { font-family: ${theme.fontFamily}; }` : ""}`;

  // Custom CSS — already sanitized server-side, scoped under html.mm-widget
  if (theme.customCss) {
    let customStyle = document.getElementById(CUSTOM_CSS_ELEMENT_ID) as HTMLStyleElement | null;
    if (!customStyle) {
      customStyle = document.createElement("style");
      customStyle.id = CUSTOM_CSS_ELEMENT_ID;
      document.head.appendChild(customStyle);
    }
    customStyle.textContent = theme.customCss;
  } else {
    document.getElementById(CUSTOM_CSS_ELEMENT_ID)?.remove();
  }
}

/**
 * Stable per-tab session id used to group impression/start/complete events.
 */
function getSessionId(): string {
  const KEY = "membermd_widget_session";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `s_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

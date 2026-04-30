// Tiny Markdown-to-React renderer for legal agreement bodies.
// Mirrors PdfGenerationService::markdownToHtml on the backend so the
// preview the patient sees matches the PDF they'll receive.
//
// Supports: # ## ### headings, **bold**, *italic*, paragraphs.
// HTML in the source is escaped — practices can't inject markup.

import React from "react";

interface AgreementBodyProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  // Bold then italic. Process iteratively so we can return React nodes.
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Look for the next bold / italic marker
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

    let earliest: { index: number; len: number; node: React.ReactNode } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      earliest = {
        index: boldMatch.index,
        len: boldMatch[0].length,
        node: <strong key={key++}>{boldMatch[1]}</strong>,
      };
    }
    if (italicMatch && italicMatch.index !== undefined) {
      if (!earliest || italicMatch.index < earliest.index) {
        earliest = {
          index: italicMatch.index,
          len: italicMatch[0].length,
          node: <em key={key++}>{italicMatch[1]}</em>,
        };
      }
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }
    parts.push(earliest.node);
    remaining = remaining.slice(earliest.index + earliest.len);
  }

  return parts;
}

export function AgreementBody({ content, className }: AgreementBodyProps) {
  if (!content) return null;

  // Split into block-level chunks separated by blank lines.
  const blocks = content.split(/\n\s*\n/);

  return (
    <div className={className} style={{ color: "#1a1a1a", lineHeight: 1.6 }}>
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (trimmed === "") return null;

        // Headings
        let m: RegExpMatchArray | null;
        if ((m = trimmed.match(/^# (.+)$/))) {
          return (
            <h1
              key={idx}
              style={{
                fontSize: "1.5rem",
                color: "#243b53",
                fontWeight: 700,
                marginTop: idx === 0 ? 0 : "1.5rem",
                marginBottom: "0.5rem",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "0.25rem",
              }}
            >
              {renderInline(m[1])}
            </h1>
          );
        }
        if ((m = trimmed.match(/^## (.+)$/))) {
          return (
            <h2
              key={idx}
              style={{
                fontSize: "1.15rem",
                color: "#334e68",
                fontWeight: 600,
                marginTop: "1rem",
                marginBottom: "0.4rem",
              }}
            >
              {renderInline(m[1])}
            </h2>
          );
        }
        if ((m = trimmed.match(/^### (.+)$/))) {
          return (
            <h3
              key={idx}
              style={{
                fontSize: "1rem",
                color: "#475569",
                fontWeight: 600,
                marginTop: "0.85rem",
                marginBottom: "0.3rem",
              }}
            >
              {renderInline(m[1])}
            </h3>
          );
        }

        // Multi-line paragraph: render newlines as <br/>
        const lines = trimmed.split("\n");
        return (
          <p
            key={idx}
            style={{
              margin: "0.5rem 0",
              fontSize: "0.9rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {renderInline(line)}
                {li < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

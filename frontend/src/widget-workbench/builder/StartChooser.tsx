/**
 * First-run state (§4.1): the builder greets, explains the three steps, and offers to
 * start from the live portal (recommended), blank, or an imported JSON file.
 */
import { useState } from 'react';
import type { PortalLayout } from './layout';

export interface StartChooserProps {
  portalLabel: string;
  liveSummary: string | null; // e.g. "4 menus · 14 pages" or null when nothing is live yet
  onStartLive: () => void;
  onStartBlank: () => void;
  onImport: (layout: PortalLayout) => void;
  error?: string | null;
}

export function StartChooser({ portalLabel, liveSummary, onStartLive, onStartBlank, onImport, error }: StartChooserProps) {
  const [parseError, setParseError] = useState<string | null>(null);
  const show = error ?? parseError;
  return (
    <div className="start">
      <div className="start-greet">
        <h2>Build the {portalLabel} portal</h2>
        <p>
          Arrange menus and pages, place widgets, then send your layout for approval — a second
          platform administrator approves it (four-eyes) before it goes live.
        </p>
        <ol className="start-steps">
          <li>Arrange menus &amp; pages</li>
          <li>Add widgets to pages</li>
          <li>Submit for approval</li>
        </ol>
      </div>
      <div className="start-cards">
        <button type="button" className="start-card primary-click" onClick={onStartLive}>
          <b>Start from the live portal</b>
          <span className="dim small">
            {liveSummary ? `Keep what is live today (${liveSummary}) and edit from there — recommended.` : 'Nothing is live yet; today’s menu registry becomes the starting point. Recommended.'}
          </span>
        </button>
        <button type="button" className="start-card" onClick={onStartBlank}>
          <b>Start blank</b>
          <span className="dim small">One menu, one empty page — build it your way.</span>
        </button>
        <label className="start-card">
          <b>Import JSON…</b>
          <span className="dim small">Open a layout file someone shared.</span>
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              file.text().then((text) => {
                try {
                  const parsed = JSON.parse(text) as unknown;
                  if (!parsed || typeof parsed !== 'object' || !('menus' in parsed) || !Array.isArray(parsed.menus)) {
                    setParseError('That file has no menus list — it does not look like a layout.');
                    return;
                  }
                  onImport(parsed as PortalLayout);
                } catch {
                  setParseError('That file is not valid JSON.');
                }
              });
            }}
          />
        </label>
      </div>
      {show && <p className="bad small">{show}</p>}
    </div>
  );
}

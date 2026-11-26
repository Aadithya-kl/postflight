import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Lock,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import {
  PreFlightComposer,
  type ComposerTelemetrySummary,
} from './components/PreFlightComposer';
import { SafeZoneXRay } from './components/SafeZoneXRay';
import { CanonicalCompiler } from './components/CanonicalCompiler';
import { MediaOgLab } from './components/MediaOgLab';
import { TriageUtmLab } from './components/TriageUtmLab';
import { GovernanceDeck } from './components/GovernanceDeck';

type ThemeMode = 'system' | 'light' | 'dark';
type TabId = 'composer' | 'xray' | 'compiler' | 'media' | 'triage' | 'governance';

interface TabConfig {
  id: TabId;
  label: string;
}

const WORKBENCH_TABS: readonly TabConfig[] = [
  { id: 'composer', label: 'Check post' },
  { id: 'xray', label: 'Safe zones' },
  { id: 'compiler', label: 'Repurpose' },
  { id: 'media', label: 'Media & links' },
  { id: 'triage', label: 'Inbox & UTMs' },
  { id: 'governance', label: 'Safety' },
];

const COLOR_SCHEME_KEY = 'color-scheme';

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(COLOR_SCHEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Ignore storage access errors in restricted browsing contexts
  }
  return 'system';
}

function applyThemeToMeta(mode: ThemeMode): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) return;
  meta.setAttribute('content', mode === 'system' ? 'light dark' : mode);
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [activeTab, setActiveTab] = useState<TabId>('composer');
  const [announcement, setAnnouncement] = useState<string>('');
  const [killSwitchFrozen, setKillSwitchFrozen] = useState<boolean>(false);
  const [composerSummary, setComposerSummary] = useState<ComposerTelemetrySummary>({
    score: 0,
    grade: 'F',
    errors: 0,
    warnings: 0,
    passed: false,
  });

  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const panelRefs = useRef<Partial<Record<TabId, HTMLElement | null>>>({});

  const announce = useCallback((message: string) => {
    setAnnouncement('');
    window.requestAnimationFrame(() => {
      setAnnouncement(message);
    });
  }, []);

  useEffect(() => {
    applyThemeToMeta(theme);
  }, [theme]);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== COLOR_SCHEME_KEY) return;
      const next: ThemeMode =
        e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : 'system';
      setTheme(next);
      applyThemeToMeta(next);
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    for (const tab of WORKBENCH_TABS) {
      const panel = panelRefs.current[tab.id];
      if (!panel) continue;

      if (tab.id === activeTab) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', 'until-found');
      }

      const handleBeforeMatch = () => {
        setActiveTab(tab.id);
      };
      panel.addEventListener('beforematch', handleBeforeMatch);
      cleanups.push(() => panel.removeEventListener('beforematch', handleBeforeMatch));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [activeTab]);

  function handleSelectTheme(next: ThemeMode) {
    setTheme(next);
    applyThemeToMeta(next);
    try {
      if (next === 'system') {
        localStorage.removeItem(COLOR_SCHEME_KEY);
      } else {
        localStorage.setItem(COLOR_SCHEME_KEY, next);
      }
    } catch {
      // Ignore storage persistence failures
    }
    announce(`Theme changed to ${next}.`);
  }

  function activateTab(id: TabId, moveFocus = false) {
    setActiveTab(id);
    const btn = tabRefs.current[id];
    if (btn) {
      if (moveFocus) {
        btn.focus();
      }
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const total = WORKBENCH_TABS.length;
    let nextIndex: number | null = null;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % total;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + total) % total;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = total - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextTab = WORKBENCH_TABS[nextIndex];
    if (nextTab) {
      activateTab(nextTab.id, true);
    }
  }

  return (
    <div className="studio-shell">
      <a href="#main-heading" className="skip-link">
        Skip to content
      </a>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <header className="studio-header">
        <div className="studio-header-inner">
          <div className="brand-cluster">
            <span className="brand-mark" aria-hidden="true">
              <Check size={16} strokeWidth={2.7} />
            </span>
            <h1 id="main-heading" tabIndex={-1} className="brand-heading">
              PostFlight
            </h1>
          </div>

          <div className="header-controls">
            <span className="header-trust-note">
              <Lock size={13} aria-hidden="true" />
              Private, runs locally
            </span>

            {killSwitchFrozen && (
              <button
                type="button"
                className="btn btn-sm btn-hazard"
                onClick={() => activateTab('governance')}
              >
                Publishing paused
              </button>
            )}

            <div className="theme-switcher" role="group" aria-label="Color theme">
              <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === 'system'}
                aria-label="Follow system theme"
                onClick={() => handleSelectTheme('system')}
              >
                <Monitor size={14} aria-hidden="true" />
                <span className="theme-btn-label">Auto</span>
              </button>
              <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === 'light'}
                aria-label="Light theme"
                onClick={() => handleSelectTheme('light')}
              >
                <Sun size={14} aria-hidden="true" />
                <span className="theme-btn-label">Light</span>
              </button>
              <button
                type="button"
                className="theme-btn"
                aria-pressed={theme === 'dark'}
                aria-label="Dark theme"
                onClick={() => handleSelectTheme('dark')}
              >
                <Moon size={14} aria-hidden="true" />
                <span className="theme-btn-label">Dark</span>
              </button>
            </div>
          </div>
        </div>

        <nav className="workbench-nav" aria-label="Primary">
          <div className="workbench-nav-inner">
            <div
              role="tablist"
              aria-label="PostFlight tools"
              className="workbench-tablist"
            >
              {WORKBENCH_TABS.map((tab, index) => {
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[tab.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    className="workbench-tab"
                    onClick={() => activateTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                  >
                    <span>{tab.label}</span>
                    {tab.id === 'composer' && composerSummary.errors > 0 && (
                      <span className="tab-count tab-count--error" aria-label={`${composerSummary.errors} errors`}>
                        {composerSummary.errors}
                      </span>
                    )}
                    {tab.id === 'governance' && killSwitchFrozen && (
                      <span className="tab-count tab-count--error">Paused</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </header>

      <main className="studio-main">
        <section
          ref={(el) => {
            panelRefs.current.composer = el;
          }}
          role="tabpanel"
          id="panel-composer"
          aria-labelledby="tab-composer"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <PreFlightComposer
              onAnnounce={announce}
              onSummaryChange={setComposerSummary}
            />
          </div>
        </section>

        <section
          ref={(el) => {
            panelRefs.current.xray = el;
          }}
          role="tabpanel"
          id="panel-xray"
          aria-labelledby="tab-xray"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <SafeZoneXRay onAnnounce={announce} />
          </div>
        </section>

        <section
          ref={(el) => {
            panelRefs.current.compiler = el;
          }}
          role="tabpanel"
          id="panel-compiler"
          aria-labelledby="tab-compiler"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <CanonicalCompiler onAnnounce={announce} />
          </div>
        </section>

        <section
          ref={(el) => {
            panelRefs.current.media = el;
          }}
          role="tabpanel"
          id="panel-media"
          aria-labelledby="tab-media"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <MediaOgLab onAnnounce={announce} />
          </div>
        </section>

        <section
          ref={(el) => {
            panelRefs.current.triage = el;
          }}
          role="tabpanel"
          id="panel-triage"
          aria-labelledby="tab-triage"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <TriageUtmLab onAnnounce={announce} />
          </div>
        </section>

        <section
          ref={(el) => {
            panelRefs.current.governance = el;
          }}
          role="tabpanel"
          id="panel-governance"
          aria-labelledby="tab-governance"
          className="workbench-panel"
        >
          <div className="panel-inner">
            <GovernanceDeck
              onAnnounce={announce}
              killSwitchFrozen={killSwitchFrozen}
              onFrozenChange={setKillSwitchFrozen}
            />
          </div>
        </section>
      </main>

      <footer className="studio-footer">
        <div className="studio-footer-inner">
          <span>
            PostFlight runs entirely in your browser. Drafts and uploaded previews never leave your device.
          </span>
          <span>MIT Open Source</span>
        </div>
      </footer>
    </div>
  );
}

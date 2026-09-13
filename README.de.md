# wrapper-scionos

[![npm-Version](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![GitHub-Release](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Lizenz](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Ein gemeinsamer Launcher für Claude Code, Claude Desktop, Codex CLI und OpenCode — geroutet über den ausgewählten RouterLab-Dienst.

**Aktuelle Version: `7.0.0`**

[English](./README.md) · [Français](./README.fr.md) · [Changelog](./CHANGELOG.md)

## Überblick

| Client | Integration | Modellauswahl |
| --- | --- | --- |
| Claude Code | Authentifizierter Loopback-Proxy | Strategie und geprüfter Sub-Agent |
| Claude Desktop | Lokaler Mapping-Proxy und verwaltetes Profil | Desktop-Routen |
| Codex CLI | Direkter Responses-Endpunkt | Native `/model`-Liste |
| OpenCode CLI | Authentifizierter OpenAI-kompatibler Proxy | Familie, danach exaktes Modell |

Der Dienst wird vor dem Öffnen des Menüs einmal ausgewählt und bleibt während der Sitzung unverändert. Der Wrapper prüft den Token, entdeckt den aktuellen Modellkatalog und beendet den Start kontrolliert, wenn kein autorisiertes Modell verfügbar ist.

## Voraussetzungen

- Node.js `^22.13.0` oder `>=23.5.0`.
- Ein Token für den ausgewählten RouterLab-Dienst.
- Claude Code `>=2.1.220`.
- Codex CLI `>=0.144.1`.
- OpenCode `>=1.18.30`.
- Windows, macOS oder `claude-desktop-debian` unter Linux für Claude-Desktop-Profile.

## Schnellstart

Ohne globale Installation:

```bash
npx wrapper-scionos
npx wrapper-scionos --service llm
```

Oder global installieren:

```bash
npm install -g wrapper-scionos
wrapper-scionos --service routerlab
```

Das installierte Paket stellt `wrapper-scionos` und `scionos` als gleichwertige Befehle bereit.

Für `--service llm` zeigt der Wrapper einen neutralen Hinweis, weil der kostenlose Modellkatalog variieren kann:

```text
ℹ LLM service active — available models may vary
```

Für `routerlab` wird dieser Hinweis nicht angezeigt.

## Interaktives Menü

Das Hauptmenü ist auf allen Plattformen gleich:

```text
1. Claude Code
2. Claude Desktop
3. Codex CLI
4. OpenCode CLI
5. Account & access
6. Tools & diagnostics
0. Exit
```

| Eingabe | Aktion |
| --- | --- |
| `↑` / `↓` | Auswahl bewegen, mit Umlauf |
| `Enter` | Auswahl bestätigen |
| Ziffer | Angezeigten Shortcut wählen |
| Bezeichnung, Wert oder Modell-ID | Passende Auswahl wählen |
| `0`, `b`, `back` | Zurück; `0` beendet das Hauptmenü |
| `q`, `quit`, `exit` | Wrapper jederzeit beenden |
| `Esc` | Zurück oder im Hauptmenü beenden |
| `Ctrl+C` | Abbruch mit Exit-Code `130` |

Die vollständige Tastaturhilfe erscheint im Hauptmenü; Untermenüs verwenden eine kurze Version. Nach dem Start eines nativen Clients bleiben Tastatur und Ausgabe vollständig unter dessen Kontrolle.

### Sprache der Oberfläche

Standardmäßig ist die Wrapper-Oberfläche englisch:

```bash
wrapper-scionos --lang en
wrapper-scionos --lang fr
wrapper-scionos --lang de
```

`--language` ist ein Alias für `--lang`. Alternativ können `SCIONOS_LANG` oder `SCIONOS_LANGUAGE` gesetzt werden. Übersetzt werden Wrapper-Menüs und Eingabeaufforderungen, nicht die Ausgabe der nativen Clients.

## Wichtige Befehle

```bash
# Clients
wrapper-scionos claude-code --service routerlab --strategy aws
wrapper-scionos claude-code --service llm --strategy divers
wrapper-scionos claude-desktop apply-proxy --service llm --yes
wrapper-scionos claude-desktop proxy --service llm
wrapper-scionos codex launch --service llm
wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Dieses Repository zusammenfassen"

# Authentifizierung und Diagnose
wrapper-scionos auth login --service routerlab
wrapper-scionos auth status --service llm
wrapper-scionos doctor --service llm
wrapper-scionos strategies --service routerlab
```

`wrapper-scionos --help` zeigt die vollständige Befehlsreferenz. Globale Optionen funktionieren vor oder nach dem Befehl; Argumente nach `--` werden an den nativen Client weitergegeben.

## Dienste und Authentifizierung

| Dienst | Produktions-Endpunkt | Empfohlene Token-Variablen |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` bleibt als veralteter Fallback verfügbar. Tokens werden aus dem dienstbezogenen sicheren Speicher oder über eine maskierte Eingabe gelesen. Der Wrapper zeigt niemals Tokens in Menüs oder Diagnosen an.

Die Produktionsziele sind fest. Benutzerdefinierte Werte für `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` und `ANTHROPIC_BASE_URL` werden mit Warnung ignoriert und können den Produktionsverkehr nicht umleiten.

## Modellrouting

Der Wrapper verwendet die Schnittmenge aus Dienst-Allowlist und der geprüften Antwort von `GET /v1/models`. Nicht entdeckte oder nicht autorisierte Modelle werden ausgeblendet oder abgelehnt. Es gibt keinen stillen Fallback; eine leere Schnittmenge blockiert den Start.

### Claude-Code-Strategien — `llm`

| Strategie | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

Für `routerlab` gibt es die Familien Claude, AWS Claude, OpenAI GPT und Open Source. Claude Native verwendet `claude-fable-5.1`; das GPT-Mapping lautet Fable `gpt-6-astra`, Haiku `gpt-5.6-luna`, Sonnet `gpt-5.6-terra` und Opus `gpt-5.6-sol`.

### Codex CLI

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

Das Standardmodell ist **`gpt-5.6-sol`**. Es muss entdeckt und autorisiert sein; der Wrapper ersetzt es niemals stillschweigend. Über das Hauptmenü startet Codex direkt, danach zeigt der native `/model`-Selektor den temporären geprüften Katalog.

| Dienst | Allowlist |
| --- | --- |
| `routerlab` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4.1-flash`, `kimi-k3`, `qwen3.8-max`, `glm-5.3`, `glm-5.3-flash` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

Der Katalog ist temporär, enthält keine Zugangsdaten und wird nach dem Kindprozess gelöscht. Die veralteten Optionen `--direct`, `--proxy` und `--transport` wurden entfernt, da direkter Zugriff jetzt der einzige Codex-Transport ist.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
```

Interaktiv wird zuerst eine Familie und danach das genaue Modell gewählt. Ohne Eingabeaufforderung ist `gpt-5.6-sol` der Standard, sofern es entdeckt und autorisiert wird. Der Wrapper verwendet einen authentifizierten Loopback-Proxy und injiziert `OPENCODE_CONFIG_CONTENT` nur in den Kindprozess; keine `opencode.json`-Datei und kein RouterLab-Token werden geschrieben.

OpenCode aktualisieren:

```bash
opencode upgrade --method npm
```

## Sicherheitsgarantien

- Claude Code und OpenCode verwenden authentifizierte Loopback-Proxys mit prozessgebundenen Zugangsdaten.
- Claude Desktop speichert im verwalteten Profil nur ein zufälliges lokales Zugangsinstrument; der RouterLab-Token bleibt im sicheren Speicher.
- Codex erhält den Dienst-Token über `OPENAI_API_KEY` und verwendet einen temporären geprüften Modellkatalog.
- Die Modellprüfung erfolgt vor Proxy-Erstellung oder Client-Start und blockiert bei Authentifizierungs-, Netzwerk-, Antwort-, Server-, Katalog- oder Schnittmengenfehlern.
- Benutzerdefinierte Provider- und Basis-URL-Overrides können das feste RouterLab-Produktionsziel nicht ändern.

Details stehen in [docs/architecture-notes.md](./docs/architecture-notes.md). Die Codex-Migration ist in [docs/migration-5.0-codex.md](./docs/migration-5.0-codex.md) beschrieben.

## Entwicklung und Release-Prüfungen

```bash
npm test
npm run test:coverage
npm run test:entry-modes
npm run test:claude-real
npm run test:codex-real
npm run test:opencode-real
npm audit
npm pack --dry-run
```

Die Real-Client-Smoke-Tests verwenden ausschließlich Loopback-Fakes und kontaktieren RouterLab nicht. Die Abdeckung muss 85 % für Zeilen/Funktionen und 80 % für Branches erreichen.

## Lizenz

MIT © ScioNos

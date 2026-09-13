# wrapper-scionos

ScioNos-Commandline-Wrapper für Claude Code, Claude Desktop, Codex CLI und OpenCode mit RouterLab.

Aktuelle Version: `7.0.0`

[English](./README.md) · [Français](./README.fr.md)

## Voraussetzungen

- Node.js ^22.13.0 oder >=23.5.0.
- Ein RouterLab-Token für den jeweiligen Dienst.
- Claude Code >=2.1.220 für Claude-Code-Starts.
- Codex CLI >=0.144.1 für Codex-Starts.
- OpenCode 1.18.30 oder neuer für OpenCode-Starts.
- Windows, macOS oder claude-desktop-debian unter Linux für Claude-Desktop-Profile.

Für `--service llm` zeigt der Wrapper einen neutralen Hinweis an, weil die verfügbaren Modelle variieren können. Für `routerlab` wird dieser Hinweis nicht angezeigt.

## Installation und Startmodi

Ohne globale Installation:

    npx wrapper-scionos
    npx wrapper-scionos --service llm

Mit globaler Installation:

    npm install -g wrapper-scionos
    wrapper-scionos
    wrapper-scionos --service llm

Alle vier Startmodi öffnen dasselbe interaktive Menü. Der ausgewählte Dienst bleibt während der Sitzung fest. Das Hauptmenü enthält Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Konto und Zugriff, Werkzeuge und Diagnose sowie Beenden. Die Pfeiltasten bewegen die Auswahl, Enter bestätigt, die angezeigten Ziffern wählen direkt, `0` beendet das Hauptmenü oder geht in Untermenüs zurück, `b`/`back` geht zurück und `q`/`quit`/`exit` beendet den Wrapper.

Die Wrapper-Oberfläche ist standardmäßig englisch. Mit `--lang fr`, `--lang en` oder `--lang de` kann die Sprache gewählt werden; der Alias `--language` wird ebenfalls unterstützt. Alternativ können `SCIONOS_LANG` oder `SCIONOS_LANGUAGE` gesetzt werden. Die vollständige Tastaturhilfe erscheint im Hauptmenü, in Untermenüs wird eine kürzere Version verwendet. Die Ausgabe der nativen Clients bleibt unter der Kontrolle des jeweiligen Clients.

Unter Windows werden die von npm erzeugten PowerShell- und `.cmd`-Shims unterstützt. Unter Linux und macOS erstellt npm ausführbare Shell-Shims.

## Wichtige Befehle

    wrapper-scionos claude-code --service routerlab --strategy aws
    wrapper-scionos claude-code --service llm --strategy divers
    wrapper-scionos auth login --service routerlab
    wrapper-scionos auth status --service llm
    wrapper-scionos doctor --service llm
    wrapper-scionos strategies --service routerlab
    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm
    wrapper-scionos codex launch --service llm
    wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Dieses Repository zusammenfassen"

`wrapper-scionos --help` zeigt die vollständige Befehls- und Optionsreferenz. Globale Optionen können vor oder nach einem Befehl stehen. Argumente nach `--` werden an den nativen Client weitergegeben, sofern sie nicht das vom Wrapper verwaltete Routing ersetzen.

## Authentifizierung und Dienste

Produktionsendpunkte sind fest:

- `routerlab`: `https://api.routerlab.ch`
- `llm`: `https://llm-api.routerlab.ch`

Empfohlene Token-Variablen:

    ROUTERLAB_API_KEY
    ROUTERLAB_LLM_API_KEY
    WRAPPER_SCIONOS_ROUTERLAB_TOKEN
    WRAPPER_SCIONOS_LLM_TOKEN

Die sichere Speicherung ist dienstbezogen. `auth login` verwendet eine verdeckte Eingabe; `auth status`, `auth test` und `doctor` zeigen niemals den Token selbst an.

## Claude Code

Claude Code >=2.1.220 wird über einen authentifizierten Loopback-Proxy gestartet. Die geprüfte Modellliste wird vor dem Proxy-Start entdeckt und mit der Dienst-Allowlist geschnitten. Modelle außerhalb dieser Schnittmenge werden abgelehnt; es gibt keinen stillen Fallback.

Für `--service llm` stehen diese Strategien zur Verfügung:

- `claude`: `claude-fable-5`, `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5`.
- `claude-gpt`: Fable `gpt-6-astra`, Haiku `gpt-5.6-luna`, Sonnet `gpt-5.6-terra`, Opus `gpt-5.6-sol`.
- `divers`: Fable `deepseek-v4.1-flash`, Haiku `gemini-3.8-flash`, Sonnet `glm-5.3`, Opus `glm-5.3-flash`.

Für `--service routerlab` umfasst der Modellkatalog Claude Native mit `claude-fable-5.1`, AWS Claude, OpenAI GPT und Open Source. Der OpenAI-GPT-Mapper verwendet Fable `gpt-6-astra`, Haiku `gpt-5.6-luna`, Sonnet `gpt-5.6-terra` und Opus `gpt-5.6-sol`.

Der Wrapper setzt `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0` im Claude-Code-Prozess, erzwingt aber nicht mehr `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`. Die native Claude-Code-Ausgabe, MCP, Tools und Sitzungsfunktionen bleiben erhalten.

## Claude Desktop

Claude Desktop wird ausschließlich über das authentifizierte lokale Proxy-Profil unterstützt:

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

Das Profil enthält nur ein zufälliges lokales Gateway-Geheimnis. Der RouterLab-Token wird nicht im Desktop-Profil gespeichert. Vor der Anwendung und vor jedem Start wird die aktuelle Modellliste entdeckt; eine leere oder nicht autorisierte Schnittmenge blockiert den Vorgang.

## OpenCode

OpenCode wird über den offiziellen OpenAI-kompatiblen Provider und einen authentifizierten Loopback-Proxy gestartet:

    wrapper-scionos opencode --service llm
    wrapper-scionos opencode --service llm --strategy divers --model glm-5.3

Der Wrapper prüft OpenCode, entdeckt `/v1/models`, wendet die dienstbezogene Allowlist an und erlaubt nur verifizierte Modelle. Interaktiv wird zuerst eine Modellfamilie und danach das genaue Modell gewählt. Ohne Eingabeaufforderung ist `gpt-5.6-sol` das Standardmodell, sofern es verfügbar ist. Das Update des globalen OpenCode-Pakets erfolgt nativ:

    opencode upgrade --method npm

## Codex CLI

Codex wird direkt mit dem festen RouterLab-Responses-Endpunkt verbunden:

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

Der Wrapper entdeckt `/v1/models`, bildet die Schnittmenge mit der Dienst-Allowlist und erstellt nur für den Start einen temporären Katalog. Wird Codex im Hauptmenü gewählt, startet der Wrapper Codex direkt; der native `/model`-Selektor verwaltet anschließend die Modellauswahl. Ohne explizites Modell startet Codex mit `gpt-5.6-sol`, das entdeckt und autorisiert sein muss.

Aktuelle erlaubte Modelle:

- `routerlab`: `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4.1-flash`, `kimi-k3`, `qwen3.8-max`, `glm-5.3`, `glm-5.3-flash`.
- `llm`: `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`.

Die veralteten Optionen `--direct`, `--proxy` und `--transport` wurden entfernt. Kein Modell wird bei einer fehlgeschlagenen Entdeckung still ersetzt.

## Tests

    npm test
    npm run test:entry-modes
    npm run test:claude-real
    npm run test:codex-real
    npm run test:opencode-real
    npm pack --dry-run

Die Architekturdetails stehen in [docs/architecture-notes.md](./docs/architecture-notes.md). Die Codex-Migration ab Version 5 ist in [docs/migration-5.0-codex.md](./docs/migration-5.0-codex.md) beschrieben.

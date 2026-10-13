# wrapper-scioNos

[![npm-Version](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![GitHub-Release](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-%5E22.13.0%20%7C%7C%20%3E%3D23.5.0-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Lizenz](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Ein gemeinsamer Launcher für fünf Werkzeuge: Claude Code CLI, Claude Cowork, Claude Desktop, Codex CLI und OpenCode CLI — geroutet über den ausgewählten RouterLab-Dienst.

## Warum wrapper-scioNos?

Behalten Sie Ihren bevorzugten Coding-Client und wählen Sie eine RouterLab-Modellfamilie für Ihre Arbeit. Der Wrapper verwaltet die Dienstauthentifizierung und das Routing; jeder native Client behält seine eigenen Werkzeuge und Sitzungen.

```bash
# AWS-Claude-Familie auswählen
npx wrapper-scionos claude-code --service routerlab --strategy aws
```

**Aktuelle Version: `7.3.0`**

[English](./README.md) · [Français](./README.fr.md) · [Changelog](./CHANGELOG.md)

## Überblick

| Client | Integration | Modellauswahl |
| --- | --- | --- |
| Claude Code | Authentifizierter Loopback-Proxy | Strategie und geprüfter Sub-Agent |
| Claude Desktop | Lokaler Mapping-Proxy und verwaltetes Profil | Desktop-Routen |
| Claude Cowork | Über die Claude-Desktop-Integration | Gemeinsame Desktop-Routen |
| Codex CLI | Direkter Responses-Endpunkt | RouterLab-Familie, danach native `/model`-Liste |
| OpenCode CLI | Authentifizierter OpenAI-kompatibler Proxy | Familie, danach exaktes Modell |

Der Dienst wird vor dem Öffnen des Menüs einmal ausgewählt und bleibt während der Sitzung unverändert. Der Wrapper prüft den Token, entdeckt den aktuellen Modellkatalog und beendet den Start kontrolliert, wenn kein autorisiertes Modell verfügbar ist.

## Voraussetzungen

- Node.js `^22.13.0` oder `>=23.5.0`.
- Ein Token für den ausgewählten RouterLab-Dienst.
- Claude Code `>=2.1.220`; RouterLab Claude Native benötigt `>=2.1.293` und AWS Claude `>=2.1.284`. Release-Prüfungen verwenden `2.1.296`.
- Codex CLI `>=0.144.1`.
- OpenCode `>=1.18.30`; Windows-Prüfungen validieren `opencode-ai@1.18.30` und `@opencode/cli@2.0.27`.
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

Der Produktname lautet **wrapper-scioNos**. Das npm-Paket und der Hauptbefehl heißen `wrapper-scionos`; das installierte Paket stellt auch `scionos` als gleichwertigen Befehl bereit.

Für `--service llm` zeigt der Wrapper einen neutralen Hinweis, weil der Modellkatalog variieren kann:

```text
ℹ LLM-Dienst aktiv — verfügbare Modelle können variieren
```

Für `routerlab` wird dieser Hinweis nicht angezeigt.

## Interaktives Menü

Das Hauptmenü ist auf allen Plattformen gleich:

```text
1. Claude Code
2. Claude Desktop / Cowork
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

`wrapper-scionos --help` zeigt die vollständige Befehlsreferenz. Globale Optionen funktionieren vor oder nach dem Befehl. Argumente nach `--` werden bei den Startbefehlen (`claude-code`, `codex launch` und `opencode`) an den nativen Client weitergegeben; andere Befehle lehnen solche Argumente ab.

## Dienste und Authentifizierung

| Dienst | Produktions-Endpunkt | Empfohlene Token-Variablen |
| --- | --- | --- |
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

`ANTHROPIC_AUTH_TOKEN` bleibt als veralteter Fallback verfügbar. Tokens werden aus dem dienstbezogenen sicheren Speicher oder über eine maskierte Eingabe gelesen. Der Wrapper zeigt niemals Tokens in Menüs oder Diagnosen an.

Die Produktionsziele sind fest. Benutzerdefinierte Werte für `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` und `ANTHROPIC_BASE_URL` werden mit Warnung ignoriert und können den Produktionsverkehr nicht umleiten.

Unter Linux benötigt die dauerhafte sichere Speicherung `secret-tool` und einen verfügbaren Secret Service. Der bisherige Speicherbereich `claude-scionos` wird bei der Migration gelesen; die Abmeldung entfernt Einträge aus beiden Speicherbereichen.

Für Befehle mit explizitem Token ist `--token-stdin` zum Einlesen aus einer Pipe vorzuziehen. Diese Option kann nicht mit `--token` kombiniert werden; `--token` gibt jetzt eine Warnung aus, da Prozessargumente und der Shell-Verlauf das Geheimnis offenlegen können. Claude Code verwendet stattdessen die maskierte Eingabe über `auth login`, Umgebungsvariablen oder den sicheren Speicher.

## Modellrouting

Der Wrapper verwendet die Schnittmenge aus Dienst-Allowlist und der geprüften Antwort von `GET /v1/models`. Nicht entdeckte oder nicht autorisierte Modelle werden ausgeblendet oder abgelehnt. Es gibt keinen stillen Fallback; eine leere Schnittmenge blockiert den Start.

### Claude-Code-Strategien — `llm`

| Strategie | Fable | Haiku | Sonnet | Opus |
| --- | --- | --- | --- | --- |
| `claude` | `claude-fable-5` | `claude-haiku-4-5` | `claude-sonnet-5` | `claude-opus-5` |
| `claude-gpt` | `gpt-6-astra` | `gpt-5.6-luna` | `gpt-5.6-terra` | `gpt-5.6-sol` |
| `divers` | `deepseek-v4.1-flash` | `gemini-3.8-flash` | `glm-5.3` | `glm-5.3-flash` |

Für `routerlab` gibt es die Familien Claude, AWS Claude, OpenAI GPT, Open Source und Trial. Claude Native verwendet `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` und `claude-haiku-5-5`, mit Haiku 5.5 als Standard-Subagent. Diese Strategie benötigt Claude Code `>=2.1.293`; die CI prüft mit `2.1.296`. OpenAI GPT verwendet `gpt-6-astra` für Fable, `gpt-6.1-sol` für Opus und Sonnet sowie `gpt-6-luna` für Haiku und den Standard-Subagent. Open Source umfasst `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3` und `qwen3.8-max`. Trial umfasst `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial` und `MiniMax-M3-trial`; sein Claude-Code-Subagent ist fest auf `deepseek-v4.1-flash-trial` eingestellt.

Claude über AWS verwendet `aws-claude-opus-5-5`, `aws-claude-sonnet-5-5` und `aws-claude-haiku-4-5`. Der Standard-Subagent bleibt AWS Haiku 4.5. Diese Strategie benötigt Claude Code `>=2.1.284`.

### Codex CLI

```bash
wrapper-scionos codex launch --service routerlab
wrapper-scionos codex launch --service llm
```

Auf `routerlab` wählen Sie beim interaktiven Start zuerst **OpenAI GPT-6**, **Open Source** oder **Trial**. Danach startet Codex mit dem temporären geprüften Katalog dieser Familie. Der native `/model`-Selektor wechselt Modelle innerhalb der gewählten Familie. Die bevorzugten Modelle sind `gpt-6.1-sol`, `deepseek-v4.1-flash` und `deepseek-v4.1-flash-trial`; fehlt das bevorzugte Modell, verlangt der interaktive Modus eine explizite Auswahl aus den verfügbaren Modellen, auch bei nur einem Modell. Nicht interaktiv wird der Start mit einem Hinweis auf `--model <id>` abgebrochen. Ein nicht verfügbares explizites Modell führt immer zu einem Fehler.

Ohne gewählte Familie ist der RouterLab-Standard **`gpt-6.1-sol`**. Der Dienst `llm` behält **`gpt-5.6-sol`**, und sein Hauptmenüeintrag startet Codex direkt. Explizite Modelle und diese Dienststandards müssen entdeckt und autorisiert sein. Mit `--strategy claude-gpt|open-source|trial` wählen Sie eine RouterLab-Familie in der Befehlszeile, mit `--model` ein genaues Modell.

| Dienst | Allowlist |
| --- | --- |
| `routerlab` | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `hy4-preview`, `kimi-k3`, `minimax-m3`, `qwen3.8-max`, `deepseek-v4.1-flash-trial`, `glm-5.3-flash-trial`, `qwen3.8-flash-trial`, `gpt-6-luna-trial`, `MiniMax-M3-trial` |
| `llm` | `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` |

Der Katalog ist temporär, enthält keine Zugangsdaten und wird nach dem Kindprozess gelöscht. Die veralteten Optionen `--direct`, `--proxy` und `--transport` wurden entfernt, da direkter Zugriff jetzt der einzige Codex-Transport ist.

### OpenCode CLI

```bash
wrapper-scionos opencode --service llm
wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
wrapper-scionos opencode --service routerlab --strategy trial --model deepseek-v4.1-flash-trial
```

Interaktiv wird zuerst eine Familie und danach das genaue Modell gewählt. OpenCode RouterLab verwendet die Familien Claude Native, AWS Claude, OpenAI GPT, Open Source und Trial; das Standardmodell ist `gpt-6.1-sol`; der Dienst `llm` behält `gpt-5.6-sol`. Trial verwendet `deepseek-v4.1-flash-trial` als festes Claude-Code-Subagent-Modell; OpenCode behandelt es als normales auswählbares Modell. Der Wrapper verwendet einen authentifizierten Loopback-Proxy und injiziert `OPENCODE_CONFIG_CONTENT` nur in den Kindprozess; keine `opencode.json`-Datei und kein RouterLab-Token werden geschrieben.

OpenCode aktualisieren:

```bash
opencode upgrade --method npm # 1.x
# 2.x: opencode upgrade --help
```

## Zeitlimits für Proxy-Antworten

Claude Code, OpenCode, Desktop und Cowork verwenden diese beim Proxy-Start gelesenen Umgebungsvariablen. Werte sind ganze Millisekunden; ungültige Werte verhindern den Start.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS` | `120000` | Von der Upstream-Anfrage bis zu den ersten Body-Bytes; Header allein setzen das Limit nicht zurück |
| `WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS` | `120000` | Maximaler Abstand zwischen Body-Blöcken; bei jedem Block zurückgesetzt |
| `WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS` | `0` | Gesamtdauer nach dem ersten Block; null deaktiviert die Grenze |

Erstantwort- und Inaktivitätslimits müssen positiv sein. Ein aktiver Stream darf standardmäßig länger als 120 Sekunden laufen. Eine Client-Trennung bricht die Upstream-Anfrage ab. Vor Beginn einer Antwort liefert ein Timeout HTTP 504; während der Antwort wird der Stream geschlossen. Timer und Upstream-Streams werden nach jedem Ausgang bereinigt.

Eingehende Client-Header haben weiterhin 30 Sekunden und der vollständige Request-Body 120 Sekunden, mit höchstens 64 MiB komprimiert und dekomprimiert. Diese festen Empfangslimits sind von den Upstream-Antwortlimits getrennt. Codex verwendet seinen nativen direkten Transport ohne diese Proxy-Einstellungen.

## Dauerhafte Profile und Geheimnisse

Desktop und Cowork teilen ein verwaltetes Desktop-Profil und dessen Proxy. Das Anwenden schreibt Gateway-URL, zufälligen lokalen Zugangsschlüssel, Modellrouten und Cowork-Egress-Host dauerhaft in das Claude-3p-Profil und dessen `_meta.json`. Beim Stoppen des Proxys bleibt das Profil aktiv. Starten Sie den Proxy erneut oder stellen Sie mit `wrapper-scionos claude-desktop restore --yes` das offizielle Profil wieder her. Status und Dry-run zeigen den Zustand. Profil-/Proxy-Tests bestätigen keine Ausführung in der Desktop- oder Cowork-Anwendung.

Gespeicherte Dienst-Tokens verwenden Windows DPAPI, macOS Keychain oder Linux Secret Service. Linux benötigt `secret-tool`; es gibt keinen Klartext-Fallback. Der macOS-Helfer ruft Security-APIs über `osascript` auf, empfängt das Geheimnis über stdin, prüft jeden Schreibvorgang durch erneutes Lesen, lehnt interaktive Keychain-Abfragen ab und begrenzt jede Operation auf 15 Sekunden. Der echte macOS-Test ist noch als Release-Voraussetzung auszuführen; siehe Validierungsbericht.

Während der Ausführung hält der Wrapper den Dienst-Token im Speicher. Claude Code und OpenCode erhalten nur einen lokalen Proxy-Schlüssel über ihre Kindprozess-Umgebung; Desktop speichert diesen lokalen Schlüssel im Profil. Codex erhält den Dienst-Token über `OPENAI_API_KEY` im Kindprozess. Umgebungen sind für den Prozess und ausreichend privilegierte Prozesse sichtbar; sicherer Speicher schützt Tokens im Ruhezustand. Maskierte Eingabe oder `--token-stdin` ist einem Token als Argument vorzuziehen.

## Geprüfte Kompatibilität

Unter Windows mit Node 24.19.0 bestand Claude Code 2.1.296 13 Routing-Szenarien; Codex 0.144.1 und 0.157.0 bestanden Responses-Streaming und natives model/list; OpenCode 1.18.30 und 2.0.27 bestanden exaktes Modell, HTTP-Pfade, Authentifizierung, Streaming und einen nativen read-Werkzeugzyklus mit simulierten Anbietern. OpenCode 2 verwendet den nativen Modus `--standalone`, damit sein privater Server die temporäre Proxy-Konfiguration erhält. Sein gemeinsam genutzter Hintergrunddienst ist mit dieser Integration pro Start inkompatibel.

Ein entdecktes und autorisiertes Modell ist auswählbar; dies belegt weder reale RouterLab-Inferenz noch dessen Werkzeugkompatibilität. Produktionsinferenz, echte Desktop-/Cowork-Anwendungsläufe und plattformübergreifende CI-Ergebnisse werden hier nicht behauptet. Preise, Einsparungen, Hosting-Standorte und Abonnements benötigen separate RouterLab-Belege. Der [Validierungsbericht 7.3.0](./docs/release-7.3.0-validation.md) nennt Umfang und ausstehende Prüfungen.

## Sicherheitsgarantien

- Claude Code und OpenCode verwenden authentifizierte Loopback-Proxys mit prozessgebundenen Zugangsdaten.
- Claude Desktop speichert im verwalteten Profil nur ein zufälliges lokales Zugangsinstrument; der Dienst-Token bleibt im Wrapper und seiner gewählten Token-Quelle.
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
npm run test:keychain-real # macOS
npm audit
npm pack --dry-run
```

`npm run release:check` führt Unit-Tests, Abdeckung, Startmodi, alle drei echten Clients, Keychain, Audit und Paketprüfung aus. Keychain wird außerhalb von macOS übersprungen; dies erfüllt nicht die macOS-Release-Voraussetzung.

Die Real-Client-Smoke-Tests verwenden ausschließlich Loopback-Fakes und kontaktieren RouterLab nicht. Die Abdeckung muss 85 % für Zeilen/Funktionen und 80 % für Branches erreichen.

Ein lokales, noch nicht veröffentlichtes Paket testen:

```bash
npm pack
npx --yes --package ./wrapper-scionos-7.3.0.tgz wrapper-scionos
```

## Lizenz

MIT © ScioNos

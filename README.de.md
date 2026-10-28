# wrapper-scioNos

[![npm-Version](https://img.shields.io/npm/v/wrapper-scionos?logo=npm&label=npm)](https://www.npmjs.com/package/wrapper-scionos)
[![GitHub-Release](https://img.shields.io/github/v/release/ScioNos/wrapper-scionos?display_name=tag&sort=semver&label=release)](https://github.com/ScioNos/wrapper-scionos/releases)
[![Node.js](https://img.shields.io/badge/node-24.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Lizenz](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Ein gemeinsamer Launcher für sechs Werkzeuge: Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Claude Cowork und Codex App, geroutet über den ausgewählten RouterLab-Dienst.

## Warum wrapper-scioNos?

Behalten Sie Ihren bevorzugten Coding-Client und wählen Sie eine RouterLab-Modellfamilie für Ihre Arbeit. Der Wrapper verwaltet die Dienstauthentifizierung und das Routing; jeder native Client behält seine eigenen Werkzeuge und Sitzungen.

```bash
# AWS-Claude-Familie auswählen
wrapper-scionos claude-code --service routerlab --strategy aws
```

**Beta: [`8.0.0-beta.1`](https://github.com/ScioNos/wrapper-scionos/releases/tag/v8.0.0-beta.1) — Strukturierte Terminalkonsole.**

Letzte stabile Version: [Versionshinweise v7.3.0](https://github.com/ScioNos/wrapper-scionos/releases/tag/v7.3.0) · [npm 7.3.0](https://www.npmjs.com/package/wrapper-scionos/v/7.3.0). Das Beta-Paket steht als Download in der GitHub-Vorabversion bereit.

[English](./README.md) · [Français](./README.fr.md) · [Changelog](./CHANGELOG.md)

## Überblick

| Client | Integration | Modellauswahl |
| --- | --- | --- |
| Claude Code | Authentifizierter Loopback-Proxy | Strategie und geprüfter Sub-Agent |
| Claude Desktop | Lokaler Mapping-Proxy und verwaltetes Profil | Desktop-Routen |
| Claude Cowork | Über die Claude-Desktop-Integration | Gemeinsame Desktop-Routen |
| Codex CLI | Direkter Responses-Endpunkt | RouterLab-Familie, danach native `/model`-Liste |
| OpenCode CLI | Authentifizierter OpenAI-kompatibler Proxy | Familie, danach exaktes Modell |
| Codex App | Direkter Responses-Endpunkt mit wiederherstellbaren temporären Einstellungen | Familie und Modell aus dem geprüften Codex-Katalog |

Der Dienst wird vor dem Öffnen des Menüs einmal ausgewählt und bleibt während der Sitzung unverändert. Der Wrapper prüft den Token, entdeckt den aktuellen Modellkatalog und beendet den Start kontrolliert, wenn kein autorisiertes Modell verfügbar ist.

## Voraussetzungen

- Node.js `24.x`.
- Ein Token für den ausgewählten RouterLab-Dienst.
- Claude Code `>=2.1.220`; RouterLab Claude Native benötigt `>=2.1.293` und AWS Claude `>=2.1.284`. Die CI verwendet `2.1.296`; die Windows-Prüfung vom 28. Oktober verwendete `2.1.309`.
- Codex CLI `>=0.144.1`.
- Codex App unter Windows oder macOS mit eingebetteter Engine `>=0.164.0`; Linux wird nicht unterstützt. Am 28. Oktober lokal mit App `26.1023.6123.0` und Engine `0.165.0-alpha.1.2` geprüft.
- OpenCode `>=1.18.30`; Windows-Prüfungen validieren `opencode-ai@1.18.30` und `@opencode/cli@2.0.27`.
- Windows, macOS oder `claude-desktop-debian` unter Linux für Claude-Desktop-Profile.

## Schnellstart

### Beta 8.0.0-beta.1

Diese README beschreibt den aktuellen Branch `8.0.0`. Das veröffentlichte Beta-Archiv stammt von `a77500f`; spätere Korrekturen unter [Unreleased](./CHANGELOG.md#unreleased) benötigen den aktuellen Checkout. Führen Sie dafür `npm ci` und danach `npm start` im Repository-Stammverzeichnis aus.

Laden Sie [wrapper-scionos-8.0.0-beta.1.tgz](https://github.com/ScioNos/wrapper-scionos/releases/download/v8.0.0-beta.1/wrapper-scionos-8.0.0-beta.1.tgz) in ein Verzeichnis Ihrer Wahl herunter und öffnen Sie dort ein Terminal. Diese Beta wird über GitHub verteilt und ist nicht auf npm veröffentlicht. Starten Sie das heruntergeladene Archiv ohne globale Installation; `--prefix .` lässt npx es in diesem Verzeichnis suchen:

```bash
npx --prefix . --yes --package ./wrapper-scionos-8.0.0-beta.1.tgz wrapper-scionos
npx --prefix . --yes --package ./wrapper-scionos-8.0.0-beta.1.tgz wrapper-scionos --service llm
```

Oder installieren Sie dieses Beta-Archiv global:

```bash
npm install -g ./wrapper-scionos-8.0.0-beta.1.tgz
wrapper-scionos --service routerlab
```

### Stabile Version von npm

Die folgenden Befehle verwenden die stabile npm-Version mit dem Tag `latest`, derzeit 7.3.0:

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

## Strukturierte Terminalkonsole

Die Konsole bietet **Start**, **Starten**, **Desktop-Anwendungen**, **Konto und Zugang** und **Diagnose**. Ab 100 Spalten steht die Navigation seitlich, zwischen 60 und 99 Spalten oben. Fenster mit weniger als 60 Spalten oder 18 Zeilen, `TERM=dumb` und umgeleitete Ausgaben verwenden das lineare Menü.

```bash
npm start -- --lang de
node index.js --lang de
# In PowerShell, falls npm.ps1 Argumente verschluckt:
npm.cmd start -- --lang de
```

Die Startseite zeigt lokal erkannte Clients und unterscheidet **Token gespeichert** von **Zugang geprüft**. Die lokale Erkennung läuft im Hintergrund. Die Navigation ruft den Dienst nicht wiederholt auf; Zugang und Modelle werden vor jedem Start erneut geprüft.

| Eingabe | Aktion |
| --- | --- |
| Linksklick | Werkzeug, Navigation, Auswahl, Kontrollkästchen oder Schaltfläche aktivieren |
| Mausrad / `[‹]` und `[›]` | Listen durchlaufen und Seiten wechseln |
| `L` oder Sprache in der Kopfzeile | Englisch, Französisch oder Deutsch wählen |
| `Tab` | Zwischen Navigation und Inhalt wechseln |
| `↑` / `↓` | Verfügbare Einträge mit Seitennavigation auswählen |
| `Enter` | Auswahl aktivieren |
| `Leertaste` | Einstellung oder Desktop-Modellfamilie umschalten |
| `1`, `2`, `3`, `4`, `5`, `6` auf der Startseite | Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Claude Cowork, Codex App |
| `Q` oder `0` | Konsole beenden |
| `Esc` | Auswahl abbrechen oder zur Startseite zurückkehren |
| `Ctrl+C` | Konsole beenden (`130`); im nativen Client dessen Sitzung unterbrechen und zur Startseite zurückkehren |

Die Maus wird in kompatiblen Terminals automatisch aktiviert, auch über SSH zu einem VPS, wenn das lokale Terminal Mausereignisse weiterleitet. Die Tastatur bleibt jederzeit nutzbar. Mit `SCIONOS_MOUSE=0` wird die Mauserfassung deaktiviert und die normale Textauswahl des Terminals wieder möglich. Bei `TERM=dumb` und `TERM=linux` bleibt die Mauserfassung aus.

Eine seitenweise Übersicht zeigt vor der Startbestätigung die vollständige Konfiguration. Während eines nativen Clients gibt die Konsole das Terminal frei und deaktiviert ihre Mauserfassung. Nach Erfolg, Fehler oder Unterbrechung kehrt sie zur Startseite zurück. Direkte Befehle behalten ihre Exit-Codes. Das lineare Menü behält seine bisherigen Ziffern- und Texteingaben.

**Diese Konfiguration speichern** ist standardmäßig aktiviert. Nach dem tatsächlichen Start des Clients werden Einstellungen unter `~/.wrapper-scionos/ui-state.json` getrennt nach Dienst und Client gespeichert. Die Datei enthält keine Tokens, Protokolle oder Zugangsprüfungen. Eine nicht verfügbare gespeicherte Auswahl muss ausdrücklich ersetzt werden. Ohne Häkchen bleibt die vorher gespeicherte Konfiguration erhalten.

Desktop-Anwendungen trennt das gemeinsame Claude-Desktop-/Cowork-Profil vom Proxy dieser Konsole. Der Proxy bleibt beim Navigieren aktiv. Stoppen behält das Profil; die bestätigte Wiederherstellung des offiziellen Modus entfernt es. Vorhandene Profile mit mehreren Familien bleiben erhalten. Beim Beenden stoppt die Konsole ihre eigenen Proxies. Codex App hat eigene Aktionen und Zustände.

### Codex App und Schutz der TOML-Konfiguration

Speichern Sie zuerst den Token unter **Konto und Zugang** oder mit `node index.js auth login --service routerlab`. Wählen Sie **6 — Codex App**, Familie und Modell und bestätigen Sie die Übersicht. Die Konsole bleibt während der App-Nutzung bedienbar. Eine bereits geöffnete App müssen Sie selbst neu starten, damit die neue Verbindung geladen wird.

```bash
node index.js codex-app status --json
node index.js codex-app launch --service routerlab --strategy claude-gpt --model gpt-6.1-sol --dry-run --no-prompt --json
node index.js codex-app launch --service routerlab --strategy claude-gpt --model gpt-6.1-sol --yes --no-prompt
# Der Startbefehl bleibt aktiv. Strg+C stellt die bisherigen Einstellungen wieder her.
node index.js codex-app restore --dry-run --json
node index.js codex-app restore --yes
```

`codex-app` ohne Aktion zeigt den Status. Ein Launch-Dry-Run erzeugt keine Dateien und öffnet die App nicht; Zugang und Modellerkennung benötigen weiterhin eine Verbindung. Direkte Starts ohne Dialog verlangen `--yes`. Restore ohne `--yes` zeigt nur eine Vorschau. JSON-Ausgabe für Launch verlangt `--dry-run`; andere Befehle behalten ihre JSON-Hülle und Exit-Codes.

Geändert werden nur `model`, `model_provider`, `model_catalog_json` und der reservierte Anbieter `scionos_routerlab` oder `scionos_llm`. Andere Einstellungen, MCP-Server, Kommentare, Reihenfolge, UTF-8-BOM und Zeilenenden bleiben erhalten. Ein bereits vorhandener, nicht von dieser Sitzung verwalteter reservierter Anbieter wird abgelehnt. Die erste Aktivierung erstellt eine datierte Sicherung und ein privates Journal unter `~/.wrapper-scionos/codex-app/`. Sitzungssperre und atomare Schreibvorgänge erkennen konkurrierende Änderungen. Ungültiges TOML wird abgelehnt.

Beim interaktiven Beenden können Sie eine normale App-Schließung mit anschließender Wiederherstellung anfordern, bei geöffneter App wiederherstellen oder das Beenden abbrechen. Die App wird nie zwangsweise beendet. SIGTERM und nichtinteraktive Ausgänge stellen ohne App-Schließung wieder her. Eine geöffnete App kann die geladene Verbindung bis zum nächsten Neustart behalten. Eigene Änderungen an verwalteten Einstellungen blockieren die gesamte Wiederherstellung und bewahren die aktuelle Datei; unabhängige persönliche Änderungen bleiben erhalten. Nach einem Absturz prüfen Sie den Status und verwenden ausdrücklich `codex-app restore --dry-run` und anschließend `codex-app restore --yes` oder Desktop-Anwendungen. Die Sicherung wird nie blind über Ihre Konfiguration kopiert.

Der Token bleibt im vorhandenen sicheren Speicher. Ein dauerhaft installierter, unabhängiger Helfer liest ihn aus dem App-Prozess ohne RouterLab-Terminalvariablen. TOML, Katalog, Journal und Einstellungen enthalten keinen Token. Helfer und Katalog bleiben erhalten, solange eine geöffnete App sie benötigen könnte. App-Einstellungen bleiben je Dienst von Codex CLI getrennt. Responses wird direkt verwendet; [OpenAI dokumentiert die Befehlsauthentifizierung für die Windows-App](https://learn.chatgpt.com/docs/enterprise/connect-to-a-gateway#configure-the-windows-app). Native Prüfungen verwenden ein temporäres `CODEX_HOME`; Ihre echte Konfiguration wird erst über die ausdrückliche Konsolenaktion oder `launch --yes` aktiviert.

### Sprache der Oberfläche

Die aktive Sprache steht in der Kopfzeile. Mit **L** oder **Language / Langue / Sprache** auf der Startseite wechseln Sie während der Sitzung zwischen **English**, **Français** und **Deutsch**. Dienst und Modellauswahl bleiben erhalten. Modellfamilien verwenden ihre Katalogbezeichnungen, einschließlich **💸 Claude via AWS**.

Der Wrapper verwendet eine unterstützte Systemsprache und fällt andernfalls auf Englisch zurück. Eine Sprache lässt sich ausdrücklich wählen:

```bash
wrapper-scionos --lang en
wrapper-scionos --lang fr
wrapper-scionos --lang de
```

`--language` ist ein Alias für `--lang`. Ohne ausdrückliche Option bestimmt die erste definierte Variable aus `SCIONOS_LANG`, `SCIONOS_LANGUAGE`, `LC_ALL` und `LANG` in dieser Reihenfolge die Sprache. Eine Locale wie `fr_CH.UTF-8` wählt die unterstützte Sprache; fehlt der Umgebungswert oder wird er nicht erkannt, gilt Englisch. Übersetzt werden Wrapper-Menüs und Eingabeaufforderungen, nicht die Ausgabe der nativen Clients.

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

Ohne gewählte Familie ist der RouterLab-Standard **`gpt-6.1-sol`**. Der Dienst `llm` behält **`gpt-5.6-sol`**. Die strukturierte Konsole bereitet Familie und Modell vor; das lineare Menü behält den direkten Start. Explizite Modelle und diese Dienststandards müssen entdeckt und autorisiert sein. Mit `--strategy claude-gpt|open-source|trial` wählen Sie eine RouterLab-Familie in der Befehlszeile, mit `--model` ein genaues Modell.

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

Desktop und Cowork teilen ein verwaltetes Desktop-Profil und dessen Proxy. Das Anwenden schreibt Gateway-URL, zufälligen lokalen Zugangsschlüssel, Modellrouten und Cowork-Egress-Host dauerhaft in das Claude-3p-Profil und dessen `_meta.json`. Beim Stoppen des Proxys bleibt das Profil aktiv. Starten Sie den Proxy erneut oder stellen Sie mit `wrapper-scionos claude-desktop restore-official --yes` das offizielle Profil wieder her. Status und Dry-run zeigen den Zustand. Profil-/Proxy-Tests bestätigen keine Ausführung in der Desktop- oder Cowork-Anwendung.

Gespeicherte Dienst-Tokens verwenden Windows DPAPI, macOS Keychain oder Linux Secret Service. Linux benötigt `secret-tool`; es gibt keinen Klartext-Fallback. Neue macOS-Einträge verwenden native Security-APIs über `osascript`, mit dem Geheimnis auf stdin und deaktivierter Interaktion. Bestehende Einträge, die `security` vertrauen, behalten ihre Zugriffsregeln und verwenden dieses Programm zum Lesen und Aktualisieren; Aktualisierungen erhalten den hexadezimal codierten Wert als einzelnen Befehl auf stdin. Jeder Systemaufruf ist auf 15 Sekunden begrenzt und jeder Schreibvorgang wird durch erneutes Lesen geprüft. Echte macOS-Prüfungen bestanden für neue Einträge, UTF-8-Aktualisierungen, beide älteren Namensräume und Löschung; siehe Validierungsbericht.

Während der Ausführung hält der Wrapper den Dienst-Token im Speicher. Claude Code und OpenCode erhalten nur einen lokalen Proxy-Schlüssel über ihre Kindprozess-Umgebung; Desktop speichert diesen lokalen Schlüssel im Profil. Codex erhält den Dienst-Token über `OPENAI_API_KEY` im Kindprozess. Umgebungen sind für den Prozess und ausreichend privilegierte Prozesse sichtbar; sicherer Speicher schützt Tokens im Ruhezustand. Maskierte Eingabe oder `--token-stdin` ist einem Token als Argument vorzuziehen.

## Geprüfte Kompatibilität

Die folgenden historischen Ergebnisse betreffen 7.3.0. Prüfungen dieses Branches stehen im [Entwicklungsbericht 8.0.0](./docs/release-8.0.0-validation.md).

Unter Windows mit Node 24.19.0 bestand Claude Code 2.1.296 13 Routing-Szenarien; Codex 0.144.1 und 0.157.0 bestanden Responses-Streaming und natives model/list; OpenCode 1.18.30 und 2.0.27 bestanden exaktes Modell, HTTP-Pfade, Authentifizierung, Streaming und einen nativen read-Werkzeugzyklus mit simulierten Anbietern. OpenCode 2 verwendet den nativen Modus `--standalone`, damit sein privater Server die temporäre Proxy-Konfiguration erhält. Sein gemeinsam genutzter Hintergrunddienst ist mit dieser Integration pro Start inkompatibel.

[Alle 37 GitHub-CI-Jobs bestanden](https://github.com/ScioNos/wrapper-scionos/actions/runs/38377724549), einschließlich dieser Claude-/OpenCode-Versionen und Codex 0.144.1 unter Windows, macOS und Linux sowie echter Keychain-Prüfungen unter macOS. Der Bericht nennt die genauen Node-Konfigurationen und Runner-Versionen.

Ein entdecktes und autorisiertes Modell ist auswählbar; dies belegt weder reale RouterLab-Inferenz noch dessen Werkzeugkompatibilität. RouterLab-Produktionsinferenz und die echten Desktop-/Cowork-Anwendungen bleiben ungeprüft. Preise, Einsparungen, Hosting-Standorte und Abonnements benötigen separate RouterLab-Belege. Der [Validierungsbericht 7.3.0](./docs/release-7.3.0-validation.md) nennt Umfang und ausstehende Anwendungsprüfungen.

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
npm run test:codex-app-real # installierte App unter Windows/macOS
npm audit
npm pack --dry-run
```

`npm run release:check` führt Unit-Tests, Abdeckung, Startmodi, alle drei echten CLI-Clients, Keychain, die eingebettete Codex-App-Engine, Audit und Paketprüfung aus. Keychain wird außerhalb von macOS übersprungen. Die App-Prüfung wird auf nicht unterstützten Plattformen und ohne installierte App übersprungen. Solche übersprungenen Prüfungen bestätigen keine Plattform- oder Engine-Kompatibilität.

Die Real-Client-Smoke-Tests verwenden ausschließlich Loopback-Fakes und kontaktieren RouterLab nicht. Die Abdeckung muss 85 % für Zeilen/Funktionen und 80 % für Branches erreichen.

Ein lokales, noch nicht veröffentlichtes Paket testen:

```bash
npm pack
npx --prefix . --yes --package ./wrapper-scionos-8.0.0-beta.1.tgz wrapper-scionos
```

## Lizenz

MIT © ScioNos

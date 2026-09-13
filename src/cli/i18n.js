export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'fr', 'de']);

const TRANSLATIONS = Object.freeze({
  en: Object.freeze({
    serviceActive: ({ service }) => `Active service: ${service}`,
    serviceLlmAvailability: 'ℹ Active LLM service — available models may vary',
    compatibility: 'Compatible Windows, macOS, Linux via ',
    chooseDestination: 'Choose where you want to go:',
    chooseDesktopAction: 'Choose a Claude Desktop action:',
    chooseAccountAction: 'Choose an account action:',
    chooseTool: 'Choose a tool:',
    selectOption: 'Select an option:',
    selectClaudeStrategy: ({ service }) => `Select Model Strategy on ${service}:`,
    selectSubagentModel: ({ service }) => `Select Subagent Model on ${service}:`,
    selectCodexFamily: ({ service }) => `Select a Codex model family on ${service}:`,
    selectCodexModel: ({ service }) => `Select a Codex model on ${service}:`,
    selectOpenCodeFamily: ({ service }) => `Select an OpenCode model family on ${service}:`,
    selectOpenCodeModel: ({ service }) => `Select an OpenCode model on ${service}:`,
    backHome: '← Back to home',
    backStrategy: '← Back to strategy',
    returnMain: 'Return to the main menu without launching Claude Code.',
    returnPrevious: 'Return to the previous menu.',
    chooseDifferentStrategy: 'Choose a different Claude Code strategy.',
    tokenWord: 'token',
    restoreOfficialConfirm: 'Restore Claude Desktop official mode now?',
    replaceInvalidProfile: ({ requested }) => `Replace the existing invalid or non-proxy Claude Desktop profile with ${requested}?`,
    replaceCurrentMapping: ({ current, requested }) => `Replace the current Claude Desktop mapping (${current}) with ${requested}?`,
    invalidOption: 'Invalid option.',
    unavailableOption: ({ value }) => `"${value}" is not an available option.`,
    helpHome: '↑↓ navigate • Enter select • key/text select • 0/b/back exit • q/quit/exit quit • Esc quit',
    helpCompact: '↑↓ navigate • Enter select • 0/b/back back • q/quit/exit quit • Esc back',
    routes: {
      home: 'ScioNos Wrapper',
      desktop: 'Claude Desktop',
      account: 'Account & access',
      tools: 'Tools & diagnostics',
    },
    menu: {
      home: {
        'claude-code': ['Claude Code', 'Start a coding session through RouterLab.'],
        'claude-desktop': ['Claude Desktop', 'Configure and run the local Desktop mapping.'],
        codex: ['Codex CLI', 'Start a Codex session through RouterLab.'],
        opencode: ['OpenCode CLI', 'Start an OpenCode session through RouterLab.'],
        auth: ['Account & access', 'Manage and validate your RouterLab token.'],
        tools: ['Tools & diagnostics', 'Inspect strategies or troubleshoot this installation.'],
        quit: ['Exit', 'Close ScioNos Wrapper.'],
      },
      desktop: {
        proxy: ['Start Local Mapping', 'Configure the selected Desktop mapping and run the local proxy.'],
        'restore-official': ['Restore Official Mode', 'Return Claude Desktop to official sign-in mode.'],
        status: ['Status', 'Show Claude Desktop configuration status.'],
        back: ['← Back to home', 'Return to the main menu.'],
      },
      account: {
        status: ['Status', 'Show token storage status.'],
        login: ['Login', 'Store a RouterLab token.'],
        test: ['Test', 'Validate the current token against RouterLab.'],
        logout: ['Logout', 'Delete the stored token.'],
        back: ['← Back to home', 'Return to the main menu.'],
      },
      tools: {
        strategies: ['Available strategies', 'Show the strategies available for this service.'],
        doctor: ['Run diagnostics', 'Check the local installation and configuration.'],
        back: ['← Back to home', 'Return to the main menu.'],
      },
    },
  }),
  fr: Object.freeze({
    serviceActive: ({ service }) => `Service actif : ${service}`,
    serviceLlmAvailability: 'ℹ Service LLM actif — les modèles disponibles peuvent varier',
    compatibility: 'Compatible Windows, macOS, Linux via ',
    chooseDestination: 'Choisissez une destination :',
    chooseDesktopAction: 'Choisissez une action pour Claude Desktop :',
    chooseAccountAction: 'Choisissez une action de compte :',
    chooseTool: 'Choisissez un outil :',
    selectOption: 'Sélectionnez une option :',
    selectClaudeStrategy: ({ service }) => `Sélectionnez la stratégie de modèle pour ${service} :`,
    selectSubagentModel: ({ service }) => `Sélectionnez le modèle du sous-agent pour ${service} :`,
    selectCodexFamily: ({ service }) => `Sélectionnez une famille de modèles Codex pour ${service} :`,
    selectCodexModel: ({ service }) => `Sélectionnez un modèle Codex pour ${service} :`,
    selectOpenCodeFamily: ({ service }) => `Sélectionnez une famille de modèles OpenCode pour ${service} :`,
    selectOpenCodeModel: ({ service }) => `Sélectionnez un modèle OpenCode pour ${service} :`,
    backHome: '← Retour à l’accueil',
    backStrategy: '← Retour à la stratégie',
    returnMain: 'Revenir au menu principal sans lancer Claude Code.',
    returnPrevious: 'Revenir au menu précédent.',
    chooseDifferentStrategy: 'Choisir une autre stratégie Claude Code.',
    tokenWord: 'jeton',
    restoreOfficialConfirm: 'Restaurer le mode officiel de Claude Desktop maintenant ?',
    replaceInvalidProfile: ({ requested }) => `Remplacer le profil Claude Desktop invalide ou non proxy existant par ${requested} ?`,
    replaceCurrentMapping: ({ current, requested }) => `Remplacer le mappage Claude Desktop actuel (${current}) par ${requested} ?`,
    invalidOption: 'Option invalide.',
    unavailableOption: ({ value }) => `"${value}" n’est pas une option disponible.`,
    helpHome: '↑↓ naviguer • Entrée sélectionner • touche/texte sélectionner • 0/b/back quitter • q/quit/exit quitter • Échap quitter',
    helpCompact: '↑↓ naviguer • Entrée sélectionner • 0/b/back retour • q/quit/exit quitter • Échap retour',
    routes: {
      home: 'ScioNos Wrapper',
      desktop: 'Claude Desktop',
      account: 'Compte et accès',
      tools: 'Outils et diagnostics',
    },
    menu: {
      home: {
        'claude-code': ['Claude Code', 'Démarrer une session de code via RouterLab.'],
        'claude-desktop': ['Claude Desktop', 'Configurer et lancer le mappage Desktop local.'],
        codex: ['Codex CLI', 'Démarrer une session Codex via RouterLab.'],
        opencode: ['OpenCode CLI', 'Démarrer une session OpenCode via RouterLab.'],
        auth: ['Compte et accès', 'Gérer et valider votre jeton RouterLab.'],
        tools: ['Outils et diagnostics', 'Consulter les stratégies ou diagnostiquer l’installation.'],
        quit: ['Quitter', 'Fermer ScioNos Wrapper.'],
      },
      desktop: {
        proxy: ['Démarrer le mappage local', 'Configurer le mappage Desktop choisi et lancer le proxy local.'],
        'restore-official': ['Restaurer le mode officiel', 'Revenir au mode de connexion officiel de Claude Desktop.'],
        status: ['État', 'Afficher l’état de la configuration de Claude Desktop.'],
        back: ['← Retour à l’accueil', 'Revenir au menu principal.'],
      },
      account: {
        status: ['État', 'Afficher l’état du stockage du jeton.'],
        login: ['Connexion', 'Enregistrer un jeton RouterLab.'],
        test: ['Tester', 'Valider le jeton actuel auprès de RouterLab.'],
        logout: ['Déconnexion', 'Supprimer le jeton enregistré.'],
        back: ['← Retour à l’accueil', 'Revenir au menu principal.'],
      },
      tools: {
        strategies: ['Stratégies disponibles', 'Afficher les stratégies disponibles pour ce service.'],
        doctor: ['Lancer les diagnostics', 'Vérifier l’installation et la configuration locales.'],
        back: ['← Retour à l’accueil', 'Revenir au menu principal.'],
      },
    },
  }),
  de: Object.freeze({
    serviceActive: ({ service }) => `Aktiver Dienst: ${service}`,
    serviceLlmAvailability: 'ℹ LLM-Dienst aktiv — verfügbare Modelle können variieren',
    compatibility: 'Kompatibel mit Windows, macOS und Linux über ',
    chooseDestination: 'Wohin möchten Sie gehen?',
    chooseDesktopAction: 'Wählen Sie eine Claude-Desktop-Aktion:',
    chooseAccountAction: 'Wählen Sie eine Kontoaktion:',
    chooseTool: 'Wählen Sie ein Werkzeug:',
    selectOption: 'Wählen Sie eine Option:',
    selectClaudeStrategy: ({ service }) => `Wählen Sie die Modellstrategie für ${service}:`,
    selectSubagentModel: ({ service }) => `Wählen Sie das Unteragentenmodell für ${service}:`,
    selectCodexFamily: ({ service }) => `Wählen Sie eine Codex-Modellfamilie für ${service}:`,
    selectCodexModel: ({ service }) => `Wählen Sie ein Codex-Modell für ${service}:`,
    selectOpenCodeFamily: ({ service }) => `Wählen Sie eine OpenCode-Modellfamilie für ${service}:`,
    selectOpenCodeModel: ({ service }) => `Wählen Sie ein OpenCode-Modell für ${service}:`,
    backHome: '← Zum Startmenü',
    backStrategy: '← Zur Strategie',
    returnMain: 'Zum Hauptmenü zurückkehren, ohne Claude Code zu starten.',
    returnPrevious: 'Zum vorherigen Menü zurückkehren.',
    chooseDifferentStrategy: 'Eine andere Claude-Code-Strategie wählen.',
    tokenWord: 'Token',
    restoreOfficialConfirm: 'Den offiziellen Claude-Desktop-Modus jetzt wiederherstellen?',
    replaceInvalidProfile: ({ requested }) => `Das vorhandene ungültige oder nicht als Proxy konfigurierte Claude-Desktop-Profil durch ${requested} ersetzen?`,
    replaceCurrentMapping: ({ current, requested }) => `Das aktuelle Claude-Desktop-Mapping (${current}) durch ${requested} ersetzen?`,
    invalidOption: 'Ungültige Option.',
    unavailableOption: ({ value }) => `„${value}“ ist keine verfügbare Option.`,
    helpHome: '↑↓ navigieren • Enter auswählen • Taste/Text auswählen • 0/b/back beenden • q/quit/exit beenden • Esc beenden',
    helpCompact: '↑↓ navigieren • Enter auswählen • 0/b/back zurück • q/quit/exit beenden • Esc zurück',
    routes: {
      home: 'ScioNos Wrapper',
      desktop: 'Claude Desktop',
      account: 'Konto und Zugriff',
      tools: 'Werkzeuge und Diagnose',
    },
    menu: {
      home: {
        'claude-code': ['Claude Code', 'Eine Codingsitzung über RouterLab starten.'],
        'claude-desktop': ['Claude Desktop', 'Das lokale Desktop-Mapping konfigurieren und starten.'],
        codex: ['Codex CLI', 'Eine Codex-Sitzung über RouterLab starten.'],
        opencode: ['OpenCode CLI', 'Eine OpenCode-Sitzung über RouterLab starten.'],
        auth: ['Konto und Zugriff', 'Ihren RouterLab-Token verwalten und prüfen.'],
        tools: ['Werkzeuge und Diagnose', 'Strategien anzeigen oder die Installation prüfen.'],
        quit: ['Beenden', 'ScioNos Wrapper schließen.'],
      },
      desktop: {
        proxy: ['Lokales Mapping starten', 'Das gewählte Desktop-Mapping konfigurieren und den lokalen Proxy starten.'],
        'restore-official': ['Offiziellen Modus wiederherstellen', 'Zum offiziellen Anmeldemodus von Claude Desktop zurückkehren.'],
        status: ['Status', 'Den Konfigurationsstatus von Claude Desktop anzeigen.'],
        back: ['← Zum Startmenü', 'Zum Hauptmenü zurückkehren.'],
      },
      account: {
        status: ['Status', 'Den Status der Token-Speicherung anzeigen.'],
        login: ['Anmelden', 'Einen RouterLab-Token speichern.'],
        test: ['Testen', 'Den aktuellen Token bei RouterLab prüfen.'],
        logout: ['Abmelden', 'Den gespeicherten Token löschen.'],
        back: ['← Zum Startmenü', 'Zum Hauptmenü zurückkehren.'],
      },
      tools: {
        strategies: ['Verfügbare Strategien', 'Die für diesen Dienst verfügbaren Strategien anzeigen.'],
        doctor: ['Diagnose ausführen', 'Die lokale Installation und Konfiguration prüfen.'],
        back: ['← Zum Startmenü', 'Zum Hauptmenü zurückkehren.'],
      },
    },
  }),
});

export function normalizeLanguage(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace('_', '-');
  if (!normalized) return null;
  const language = normalized.split('-')[0];
  return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

export function resolveLanguage(explicitValue = null, env = process.env) {
  const explicit = normalizeLanguage(explicitValue);
  if (explicit) return explicit;
  const environmentValue = env?.SCIONOS_LANG ?? env?.SCIONOS_LANGUAGE ?? env?.LC_ALL ?? env?.LANG;
  return normalizeLanguage(environmentValue) ?? 'en';
}

export function translate(language, key, variables = {}) {
  const dictionary = TRANSLATIONS[resolveLanguage(language)];
  const value = dictionary[key] ?? TRANSLATIONS.en[key] ?? key;
  return typeof value === 'function' ? value(variables) : value;
}

export function translateMenuItem(language, routeId, value) {
  const dictionary = TRANSLATIONS[resolveLanguage(language)] ?? TRANSLATIONS.en;
  return dictionary.menu[routeId]?.[value] ?? TRANSLATIONS.en.menu[routeId]?.[value] ?? null;
}

export function translateRoute(language, routeId) {
  const dictionary = TRANSLATIONS[resolveLanguage(language)] ?? TRANSLATIONS.en;
  return dictionary.routes[routeId] ?? TRANSLATIONS.en.routes[routeId] ?? routeId;
}

export function getHelpText(language, mode = 'compact') {
  return translate(language, mode === 'home' || mode === 'full' ? 'helpHome' : 'helpCompact');
}

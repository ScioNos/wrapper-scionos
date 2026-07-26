# wrapper-scionos

Wrapper en ligne de commande ScioNos pour Claude Code, Claude Desktop et Codex CLI connectés à RouterLab.

[Read in English](./README.md)

## Prérequis

- Node.js ^22.13.0 ou >=23.5.0.
- Un token RouterLab propre au service.
- Claude Code >=2.1.220 pour les lancements Claude Code.
- Codex CLI >=0.144.1 pour les lancements Codex.
- Windows, macOS ou claude-desktop-debian sous Linux pour les profils Claude Desktop.

## Installation et modes d’entrée

Sans installation globale :

    npx wrapper-scionos
    npx wrapper-scionos --service llm

Avec une installation globale :

    npm install -g wrapper-scionos
    wrapper-scionos
    wrapper-scionos --service llm

Les quatre modes ouvrent le même menu interactif. Le service sélectionné apparaît dans la bannière. Le paquet installé expose aussi scionos comme alias binaire exact de wrapper-scionos.

Sous Windows, PowerShell peut résoudre le shim `wrapper-scionos.ps1` ou `npx.ps1` généré, tandis que l’invite de commandes résout le shim `.cmd` correspondant ; npm crée et prend en charge les deux. Sous Linux et macOS, npm crée des shims shell exécutables. Le smoke test de release exerce les quatre commandes ci-dessus sur les trois systèmes.

## Commandes principales

    wrapper-scionos claude-code --service routerlab --strategy aws
    wrapper-scionos claude-code --service llm --strategy glm-5.2
    wrapper-scionos auth login --service routerlab
    wrapper-scionos auth logout --service routerlab
    wrapper-scionos auth status --service llm
    wrapper-scionos doctor --service llm
    wrapper-scionos strategies --service routerlab
    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm
    wrapper-scionos codex launch --service llm
    wrapper-scionos codex template --service llm
    wrapper-scionos codex status
    wrapper-scionos codex restore --yes

Exécute wrapper-scionos --help pour la liste de référence des commandes et options. La version affichée provient de package.json.

Les options globales sont acceptées avant ou après la commande : `wrapper-scionos --service llm doctor` et `wrapper-scionos doctor --service llm` sont équivalentes. Le préparseur s’arrête au premier argument inconnu et n’inspecte jamais ce qui suit `--`, afin de préserver le passthrough Claude Code.

Les options sont validées par commande et action : action inconnue, option hors contexte ou argument positionnel superflu termine avec le code 2. --no-prompt et --json exigent une commande explicite. La sortie humaine est utilisée par défaut. Les commandes non interactives acceptent --json et émettent un seul document stable : {"ok":true,"command":"...","data":{...}} en cas de succès ou {"ok":false,"error":{"code":"...","message":"..."}} en cas d’échec. JSON est refusé pour le menu, Claude Code, codex launch et claude-desktop proxy.

Les codes de sortie sont 0 pour un succès ou une prévisualisation, 1 pour une erreur runtime/upstream, 2 pour un usage invalide et 130 pour une invite interrompue. Auth login et logout honorent --dry-run sans invite ni mutation du stockage ; les actions explicites restent mutatives sans exiger --yes.

## Authentification et services

Points d’accès :

- routerlab : https://api.routerlab.ch
- llm : https://llm-api.routerlab.ch

Variables d’environnement recommandées :

    ROUTERLAB_API_KEY
    ROUTERLAB_LLM_API_KEY
    WRAPPER_SCIONOS_ROUTERLAB_TOKEN
    WRAPPER_SCIONOS_LLM_TOKEN

`ANTHROPIC_AUTH_TOKEN` reste un fallback de token déprécié. Les valeurs utilisateur de `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` et `ANTHROPIC_BASE_URL` sont ignorées avec un avertissement ; elles ne modifient jamais la destination de production.

Le stockage sécurisé lit wrapper-scionos et l’ancien espace claude-scionos ; logout supprime les deux. Sous Linux, la persistance exige `secret-tool` et un Secret Service disponible. Les anciens fichiers de token en clair sont signalés comme nécessitant une migration mais ne sont jamais lus ; un `auth login` réussi et vérifié les migre vers Secret Service avant de les supprimer.

auth login utilise une invite masquée. L’option --token reste disponible pour les commandes compatibles comme auth test, strategies, Codex et Claude Desktop, mais les lancements Claude Code la refusent car la ligne de commande est visible dans l’historique du shell et l’inspection des processus. La priorité Claude Code est variable d’environnement du service, puis stockage sécurisé ou invite masquée. Codex conserve volontairement sa priorité particulière : --token, stockage sécurisé, puis environnement.

## Claude Code

Claude Code 2.1.220 ou plus récent est lancé via un proxy loopback. Les identifiants et mappings gérés par le wrapper ne sont injectés que dans le processus enfant ; les arguments inconnus après -- sont transmis à Claude Code. La détection accorde cinq secondes à chaque candidat `claude --version` avant d’essayer l’exécutable suivant ; une version incompatible ou illisible échoue avant la résolution du token et tout accès réseau.

    wrapper-scionos claude-code --service routerlab --strategy aws -- -p "Résume ce dépôt"

Pour `--service llm`, la stratégie `claude` est active et associe Opus à `claude-opus-4-8`, Sonnet à `claude-sonnet-5` et Haiku à `claude-haiku-4-5-20251001`. Les sous-agents Claude Code utilisent `claude-sonnet-5` pour toutes les stratégies LLM.

Claude Code cible toujours le service officiel via son proxy loopback dédié. Le wrapper génère `ANTHROPIC_BASE_URL` uniquement pour le processus enfant ; une valeur utilisateur est ignorée. L’ancien `ANTHROPIC_AUTH_TOKEN` reste accepté comme source d’entrée avec son avertissement de dépréciation, mais le token brut et toutes les variables de token RouterLab sont retirés de l’environnement enfant. Claude reçoit seulement un identifiant aléatoire propre au proxy local et à la durée du processus. Les variables de fournisseur, endpoint, authentification, en-têtes et routage de modèle sont assainies ; les variables natives indépendantes concernant outils, MCP, certificats et réseau restent héritées. Le loopback est ajouté à `NO_PROXY` et `no_proxy`.

Le processus enfant reçoit aussi `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`. Cette variable officielle de Claude Code retire des requêtes les en-têtes `anthropic-beta` propres à Anthropic et les champs bêta de schéma d’outil que certaines passerelles ou certains modèles routés ne prennent pas en charge. Elle n’ajoute aucun prompt, instruction ou outil. Le compromis documenté par Anthropic est que la recherche dynamique des outils MCP est désactivée et que tous les outils MCP sont chargés immédiatement. Ce réglage constitue une exception de compatibilité RouterLab intentionnelle ; voir [Notes d’architecture](./docs/architecture-notes.md#claude-code-experimental-beta-compatibility).

Tout échec de découverte des modèles arrête le lancement avant la création du proxy local ou du processus Claude : authentification, redirection, réseau, timeout, réponse invalide, erreur serveur, catalogue vide ou intersection autorisée vide. La découverte utilise un transport direct vers l’endpoint fixe du service. Le proxy accepte uniquement l’intersection entre les modèles Claude Code autorisés du service et le catalogue RouterLab vérifié. Les choix natifs `/model`, reprise de session et sous-agents restent utilisables dans cette intersection ; tout autre modèle reçoit localement une réponse HTTP 403 et n’est jamais transmis.

Le proxy n’impose aucun timeout total aux générations et ferme la requête upstream si le client se déconnecte. Le nettoyage est actif dès la création du proxy, attend jusqu’à deux secondes une fermeture normale, puis force la fermeture des connexions locales restantes.

## Claude Desktop

Claude Desktop est pris en charge uniquement via le proxy local authentifié avec mapping. L’ancienne commande de profil direct a été supprimée, car elle persistait le token RouterLab dans le profil Desktop :

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

`apply-proxy` ne stocke dans le profil qu’un identifiant local aléatoire de 32 octets ; le token RouterLab reste dans sa source sécurisée. Avant l’application et avant chaque démarrage, le wrapper découvre `/v1/models` directement sur l’endpoint RouterLab fixe et n’expose que l’intersection avec les routes Desktop configurées. Les erreurs de découverte, authentification, redirection, timeout, JSON invalide, catalogue vide ou intersection vide bloquent tout et ne modifient aucun profil.

Les profils utilisent le schéma de métadonnées `wrapperScionos` v2 avec le service fixe, les stratégies, l’origine loopback et les routes vérifiées, sans token RouterLab. Un profil proxy v1 valide est migré après redécouverte en conservant son identifiant local aléatoire. Un profil direct, non géré ou sans métadonnées exige un remplacement explicite avec `apply-proxy --yes` ou une restauration officielle ; un ancien token direct n’est jamais réutilisé.

Depuis le menu interactif, Start Local Mapping utilise le service affiché dans la bannière. Un profil absent est créé directement, un profil sain et équivalent est réutilisé sans rotation de son identifiant local, et le remplacement d’un profil différent, direct, ancien ou invalide demande confirmation. L’hôte et le port stockés sont conservés sauf surcharge explicite ; un changement de service recharge le catalogue propre au service.

La base URL du service sélectionné est validée avant la résolution du token, l’ouverture du listener ou toute modification du profil. Les profils générés n’autorisent l’egress Cowork que vers le hostname exact de leur gateway. `claude-desktop status` conserve ses champs existants et ajoute `profileExists`, `applied`, `healthy` et des codes `issues` stables sans exposer les credentials.

Le proxy écoute uniquement sur des hôtes loopback exacts (`localhost`, `::1` ou une IPv4 valide de `127.0.0.0/8`) et un port explicite entre 1 et 65535. Il autorise uniquement l’API Messages : liste des modèles, messages, comptage de tokens et création/liste/lecture/annulation/résultats/suppression des batchs. Les chemins, méthodes et modèles non autorisés échouent localement ; un batch mixte invalide est refusé en entier avant tout appel upstream. Les origines navigateur sont refusées par défaut.

Les requêtes sont limitées à 64 Mio avant et après décompression. Les corps identity, gzip, deflate et Brotli sont acceptés ; zstd l’est si le runtime Node actif l’expose, sinon HTTP 415 unsupported_content_encoding est retourné. Un JSON invalide retourne HTTP 400. La réception des en-têtes est limitée à 30 secondes et celle du corps à 120 secondes. Les générations longues n’ont pas de timeout total.

Quand le proxy a été lancé depuis le menu interactif, Ctrl+C l’arrête et revient au sous-menu Claude Desktop sans conserver un code d’échec. Pour la commande directe `claude-desktop proxy`, Ctrl+C termine avec le code 130 ; SIGTERM termine avec 143 dans les deux modes.

## Codex CLI

Codex se connecte directement au point d’accès Responses RouterLab sélectionné :

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

Le wrapper autorise les modèles initiaux suivants :

- `routerlab` : `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4-pro`, `kimi-k2.7-code`, `glm-5.2`.
- `llm` : `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `kimi-k3`, `grok-4.5`, `MiniMax-M3`.

Avant le lancement, `GET /v1/models` sert uniquement à croiser cette liste avec les identifiants actuellement disponibles sur RouterLab. Un `--model` explicite doit correspondre exactement à un identifiant disponible ; aucune substitution n’est faite. Le mode interactif propose l’intersection et sélectionne automatiquement le modèle lorsqu’il n’en reste qu’un. `--no-prompt` sans `--model` exige que `gpt-5.6-sol` soit disponible.

Tous les échecs de découverte bloquent le lancement : erreur réseau, timeout, JSON invalide, HTTP 401/403, erreur serveur ou intersection vide. Les options `--direct`, `--proxy` et `--transport` ont été supprimées, car l’accès direct est désormais le seul transport Codex.

La session reçoit seulement six surcharges Codex : `model_provider`, `model`, le `name` du fournisseur, son `base_url`, `wire_api="responses"` et `env_key="OPENAI_API_KEY"`. Le token RouterLab est transmis sans modification au processus Codex via `OPENAI_API_KEY`. Les arguments natifs après `--` sont conservés, sauf ceux qui peuvent remplacer le routage ou la sélection validés par le wrapper : `-c`/`--config`, `-m`/`--model`, `--oss`, `--local-provider`, `-p`/`--profile`, `--remote` et `--remote-auth-token-env`. Utilise `--model` avant `--` pour choisir un modèle RouterLab autorisé.

Le wrapper ne génère aucun catalogue. Il ne fournit ni fenêtre de contexte, ni instructions, ni niveaux de raisonnement, ni modalités, ni déclaration de shell/outils, ni recherche, troncature ou priorité. Il ne modifie pas non plus le sandbox, les approbations, MCP, les hooks ou les fichiers d’authentification. Codex conserve son comportement natif et son propre sélecteur après le démarrage ; RouterLab/LiteLLM reste l’autorité finale pour tout changement ultérieur de modèle.

Les destinations de production sont fixes : `routerlab` utilise `https://api.routerlab.ch/v1` et `llm` utilise `https://llm-api.routerlab.ch/v1`. Les valeurs utilisateur de `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` et `ANTHROPIC_BASE_URL` sont ignorées avec un avertissement. Les variables de token restent prises en charge.

### Périmètre de l’exclusivité RouterLab

L’exclusivité RouterLab concerne uniquement le trafic de découverte et d’inférence des modèles configuré par le wrapper : liste des modèles et requêtes Responses du fournisseur sélectionné. Elle ne limite pas les fonctions réseau indépendantes du binaire officiel Codex, notamment ses vérifications de mise à jour, MCP, outils, recherche ou autres intégrations natives configurées par l’utilisateur. Le wrapper ne désactive, ne remplace et n’enrichit pas ces fonctions natives.

Quand Codex est choisi depuis le menu interactif, un échec de démarrage ou une sortie Codex non nulle affiche l’erreur et revient au menu principal. Une sortie Codex normale ferme le wrapper. Les commandes directes `codex launch` conservent le code de sortie du processus Codex.

`codex template` affiche la configuration native non persistante du fournisseur, sans catalogue. `codex status` et `codex restore` restent disponibles uniquement pour inspecter et nettoyer les configurations ou catalogues créés par d’anciennes versions. Un backup historique est restauré automatiquement ; sans backup, `config.toml` est toujours conservé et un nettoyage manuel est signalé. Le catalogue historique propre au wrapper peut être supprimé séparément.

## Compatibilité 4.x

Les anciens éléments suivants avertissent encore une seule fois par processus sur stderr :

- ANTHROPIC_AUTH_TOKEN
- --list-strategies (utiliser strategies)
- auth change (utiliser auth login)

`claude-desktop apply` n’est plus un alias de compatibilité et échoue avec une indication de migration vers `apply-proxy`.

Toutes les variables utilisateur de base URL, dont `ANTHROPIC_BASE_URL`, sont ignorées. Consulte [Migration Codex 5.0](./docs/migration-5.0-codex.md).

## Développement et portes de release

    npm test
    npm run test:coverage
    npm run test:entry-modes
    npm run test:claude-real
    npm run test:codex-real
    npm audit
    npm pack --dry-run

`npm run test:entry-modes` empaquette l’arbre de travail courant dans un tarball temporaire, l’installe dans un préfixe isolé, puis ouvre et quitte le menu interactif via `wrapper-scionos`, `wrapper-scionos --service llm`, `npx wrapper-scionos` et `npx wrapper-scionos --service llm`. Il ne nécessite ni installation globale ni version npm déjà publiée.

`npm test` utilise l’injection de dépendances interne pour les fixtures locales ; les variables d’URL de production ne peuvent pas rediriger le wrapper. `npm run test:claude-real` valide le Claude Code installé face à des réglages locaux hostiles, et `npm run test:codex-real` valide le Codex installé avec les surcharges natives du fournisseur et sans catalogue. Ces deux smoke tests utilisent uniquement de faux services loopback et ne contactent jamais RouterLab. Les seuils restent fixés à 85 % pour les lignes/fonctions et 80 % pour les branches.

Pour une version non publiée, crée un tarball local avec `npm pack`, puis teste-le avec `npx --yes --package ./wrapper-scionos-5.0.0.tgz wrapper-scionos`. Les instructions pour une version publiée restent `npm install -g wrapper-scionos` et `npx wrapper-scionos`.

Les détails d’architecture sont dans [docs/architecture-notes.md](./docs/architecture-notes.md).

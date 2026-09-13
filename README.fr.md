# wrapper-scionos

Wrapper en ligne de commande ScioNos pour Claude Code, Claude Desktop, Codex CLI et OpenCode connectés à RouterLab.

Version actuelle : `7.0.0`

[Read in English](./README.md) · [Deutsch](./README.de.md)

## Prérequis

- Node.js ^22.13.0 ou >=23.5.0.
- Un token RouterLab propre au service.
- Claude Code >=2.1.220 pour les lancements Claude Code.
- Codex CLI >=0.144.1 pour les lancements Codex.
- OpenCode 1.18.30 ou plus récent pour les lancements OpenCode.
- Windows, macOS ou claude-desktop-debian sous Linux pour les profils Claude Desktop.

Pour `--service llm`, le wrapper affiche un message informatif neutre, car les modèles disponibles peuvent varier. Ce message n’apparaît pas pour `routerlab`.

## Installation et modes d’entrée

Sans installation globale :

    npx wrapper-scionos
    npx wrapper-scionos --service llm

Avec une installation globale :

    npm install -g wrapper-scionos
    wrapper-scionos
    wrapper-scionos --service llm

Les quatre modes ouvrent le même menu interactif. Le service sélectionné apparaît sur chaque écran et reste fixe pendant la session. Le menu d’accueil contient Claude Code, Claude Desktop, Codex CLI, OpenCode CLI, Account & access, Tools & diagnostics et Exit. Les flèches parcourent les choix en boucle, Entrée confirme, les chiffres utilisent le raccourci affiché, `0` revient en arrière ou quitte depuis l’accueil, `b`/`back` revient en arrière et `q`/`quit`/`exit` quitte. Le paquet installé expose aussi scionos comme alias binaire exact de wrapper-scionos.

L’interface du wrapper est en anglais par défaut. Utilisez `--lang fr`, `--lang en` ou `--lang de` (l’alias `--language` est également accepté), ou définissez `SCIONOS_LANG`/`SCIONOS_LANGUAGE`. L’aide clavier complète apparaît à l’accueil ; les sous-menus utilisent une version courte. La langue s’applique aux invites et menus du wrapper ; les sorties produites par le client natif restent gérées par ce client.

Sous Windows, PowerShell peut résoudre le shim `wrapper-scionos.ps1` ou `npx.ps1` généré, tandis que l’invite de commandes résout le shim `.cmd` correspondant ; npm crée et prend en charge les deux. Sous Linux et macOS, npm crée des shims shell exécutables. Le smoke test de release exerce les quatre commandes ci-dessus sur les trois systèmes.

## Commandes principales

    wrapper-scionos claude-code --service routerlab --strategy aws
    wrapper-scionos claude-code --service llm --strategy divers
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
    wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Résume ce dépôt"

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

Claude Code permet de choisir un sous-agent vérifié au lancement ou via `--subagent-model <id>`. RouterLab prend en charge `claude-haiku-4-5`, `aws-claude-haiku-4-5`, `gpt-5.6-luna` et `deepseek-v4.1-flash` ; RouterLab LLM prend en charge `claude-haiku-4-5`, `glm-5.3-flash`, `deepseek-v4.1-flash` et `gpt-5.6-luna`. Le catalogue des stratégies principales RouterLab est : Claude, AWS Claude, OpenAI GPT et Open Source. Pour `--service routerlab`, la stratégie `claude-gpt` associe Fable à `gpt-6-astra`, Haiku et le sous-agent par défaut à `gpt-5.6-luna`, Sonnet à `gpt-5.6-terra` et Opus à `gpt-5.6-sol`. La stratégie `open-source` associe Fable à `deepseek-v4.1-flash`, Haiku à `glm-5.3-flash`, Sonnet à `glm-5.3`, Opus à `qwen3.8-max` et le sous-agent à `kimi-k3`. Pour `--service llm`, la stratégie `claude` associe Fable à `claude-fable-5`, Haiku à `claude-haiku-4-5`, Opus à `claude-opus-5` et Sonnet à `claude-sonnet-5`. La stratégie `claude-gpt` associe Fable à `gpt-6-astra`, Haiku à `gpt-5.6-luna`, Sonnet à `gpt-5.6-terra` et Opus à `gpt-5.6-sol`. La stratégie `divers` associe Fable à `deepseek-v4.1-flash`, Haiku à `gemini-3.8-flash`, Sonnet à `glm-5.3` et Opus à `glm-5.3-flash`. Le catalogue des stratégies principales LLM est : `claude`, `claude-gpt` et `divers` ; `glm-5.3-flash` et `deepseek-v4.1-flash` sont également disponibles dans le sélecteur de sous-agent.

Claude Code cible toujours le service officiel via son proxy loopback dédié. Le wrapper génère `ANTHROPIC_BASE_URL` uniquement pour le processus enfant ; une valeur utilisateur est ignorée. L’ancien `ANTHROPIC_AUTH_TOKEN` reste accepté comme source d’entrée avec son avertissement de dépréciation, mais le token brut et toutes les variables de token RouterLab sont retirés de l’environnement enfant. Claude reçoit seulement un identifiant aléatoire propre au proxy local et à la durée du processus. Les variables de fournisseur, endpoint, authentification, en-têtes et routage de modèle sont assainies ; les variables natives indépendantes concernant outils, MCP, certificats et réseau restent héritées. Le loopback est ajouté à `NO_PROXY` et `no_proxy`.

Le processus enfant reçoit `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0`. Le wrapper effectue sa propre découverte vérifiée et applique sa liste autorisée avant de démarrer le proxy ; Claude Code ne remplace donc pas ce catalogue contrôlé par le catalogue complet de la passerelle. Le wrapper ne force plus `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` : Claude Code conserve ses fonctions normales de protocole.

Tout échec de découverte des modèles arrête le lancement avant la création du proxy local ou du processus Claude : authentification, redirection, réseau, timeout, réponse invalide, erreur serveur, catalogue vide ou intersection autorisée vide. La découverte utilise un transport direct vers l’endpoint fixe du service. Le proxy accepte uniquement l’intersection entre les modèles Claude Code autorisés du service et le catalogue RouterLab vérifié. Les choix natifs `/model`, reprise de session et sous-agents restent utilisables dans cette intersection ; tout autre modèle reçoit localement une réponse HTTP 403 et n’est jamais transmis.

Le proxy n’impose aucun timeout total aux générations et ferme la requête upstream si le client se déconnecte. Le nettoyage est actif dès la création du proxy, attend jusqu’à deux secondes une fermeture normale, puis force la fermeture des connexions locales restantes.

## Claude Desktop

Claude Desktop est pris en charge uniquement via le proxy local authentifié avec mapping. L’ancienne commande de profil direct a été supprimée, car elle persistait le token RouterLab dans le profil Desktop :

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

`apply-proxy` ne stocke dans le profil qu’un identifiant local aléatoire de 32 octets ; le token RouterLab reste dans sa source sécurisée. Avant l’application et avant chaque démarrage, le wrapper découvre `/v1/models` directement sur l’endpoint RouterLab fixe et n’expose que l’intersection avec les routes Desktop configurées. Les erreurs de découverte, authentification, redirection, timeout, JSON invalide, catalogue vide ou intersection vide bloquent tout et ne modifient aucun profil.

Pour `--service routerlab`, le catalogue Desktop reflète les stratégies Claude Code de RouterLab. Claude Native expose `claude-fable-5.1`, `claude-opus-5`, `claude-sonnet-5` et `claude-haiku-4-5` ; les autres routes couvrent AWS Claude, GPT 5.6 et les routes Open Source `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash` et `qwen3.8-max`. Seuls les modèles retournés par la découverte RouterLab sont affichés.

Les profils utilisent le schéma de métadonnées `wrapperScionos` v2 avec le service fixe, les stratégies, l’origine loopback et les routes vérifiées, sans token RouterLab. Un profil proxy v1 valide est migré après redécouverte en conservant son identifiant local aléatoire. Un profil direct, non géré ou sans métadonnées exige un remplacement explicite avec `apply-proxy --yes` ou une restauration officielle ; un ancien token direct n’est jamais réutilisé.

Depuis le menu interactif, Start Local Mapping utilise le service affiché dans la bannière. Un profil absent est créé directement, un profil sain et équivalent est réutilisé sans rotation de son identifiant local, et le remplacement d’un profil différent, direct, ancien ou invalide demande confirmation. L’hôte et le port stockés sont conservés sauf surcharge explicite ; le catalogue propre au service est fixé au démarrage de la session.

La base URL du service sélectionné est validée avant la résolution du token, l’ouverture du listener ou toute modification du profil. Les profils générés n’autorisent l’egress Cowork que vers le hostname exact de leur gateway. `claude-desktop status` conserve ses champs existants et ajoute `profileExists`, `applied`, `healthy` et des codes `issues` stables sans exposer les credentials.

Le proxy écoute uniquement sur des hôtes loopback exacts (`localhost`, `::1` ou une IPv4 valide de `127.0.0.0/8`) et un port explicite entre 1 et 65535. Il autorise uniquement l’API Messages : liste des modèles, messages, comptage de tokens et création/liste/lecture/annulation/résultats/suppression des batchs. Les chemins, méthodes et modèles non autorisés échouent localement ; un batch mixte invalide est refusé en entier avant tout appel upstream. Les origines navigateur sont refusées par défaut.

Les requêtes sont limitées à 64 Mio avant et après décompression. Les corps identity, gzip, deflate et Brotli sont acceptés ; zstd l’est si le runtime Node actif l’expose, sinon HTTP 415 unsupported_content_encoding est retourné. Un JSON invalide retourne HTTP 400. La réception des en-têtes est limitée à 30 secondes et celle du corps à 120 secondes. Les générations longues n’ont pas de timeout total.

Quand le proxy a été lancé depuis le menu interactif, Ctrl+C l’arrête et revient au sous-menu Claude Desktop sans conserver un code d’échec. Pour la commande directe `claude-desktop proxy`, Ctrl+C termine avec le code 130 ; SIGTERM termine avec 143 dans les deux modes.

## OpenCode

OpenCode 1.18.30 ou plus récent est lancé avec le fournisseur OpenAI-compatible officiel `@ai-sdk/openai-compatible` et le point d’accès local du wrapper :

    wrapper-scionos opencode --service llm
    wrapper-scionos opencode --service llm --strategy divers --model glm-5.3
    wrapper-scionos opencode --service llm --model gpt-6-astra -- run "Résume ce dépôt"

Le wrapper vérifie l’exécutable OpenCode, résout le token du service, découvre directement `/v1/models`, puis croise le catalogue découvert avec les modèles autorisés par RouterLab. En mode interactif, il demande d’abord une famille puis le modèle exact ; `--strategy` sélectionne une famille et `--model` sélectionne un identifiant exact. Sans invite, le modèle par défaut est `gpt-5.6-sol` lorsqu’il est disponible. Une erreur d’authentification, de réseau, de découverte ou une intersection vide bloque le lancement.

Pendant la session, le wrapper démarre un proxy loopback authentifié et injecte `OPENCODE_CONFIG_CONTENT` uniquement dans le processus OpenCode. La configuration active seulement le fournisseur `scionos`, cible l’API locale `/v1` et contient un identifiant local aléatoire ; le token RouterLab brut et les fichiers de configuration persistants ne sont jamais écrits par le wrapper. Le proxy autorise les requêtes OpenAI-compatible de chat et refuse localement les modèles absents de la liste vérifiée.

Les arguments natifs OpenCode sont transmis. Les options qui pourraient remplacer le fournisseur, le modèle ou la configuration gérée (`-m`/`--model`, `--config`, `--config-dir`, `--config-content`) doivent être remplacées par les options du wrapper. Pour mettre OpenCode à jour avec l’installation npm :

    opencode upgrade --method npm

La configuration et les sessions natives d’OpenCode restent gérées par OpenCode. Le wrapper n’écrit pas de fichier `opencode.json` ; `OPENCODE_CONFIG_CONTENT` est limité à la durée du processus enfant.

## Codex CLI

Codex se connecte directement au point d’accès Responses RouterLab sélectionné :

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

Le wrapper autorise les modèles initiaux suivants :

- `routerlab` : `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `deepseek-v4.1-flash`, `kimi-k3`, `qwen3.8-max`, `glm-5.3`, `glm-5.3-flash`.
- `llm` : `gpt-5.6-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gemini-3.8-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`.

Avant le lancement, `GET /v1/models` sert uniquement à croiser cette liste avec les identifiants actuellement disponibles sur RouterLab. Un `--model` explicite doit correspondre exactement à un identifiant disponible ; aucune substitution n’est faite. Depuis le menu principal interactif, choisir Codex CLI lance directement Codex ; son sélecteur natif `/model` utilise ensuite le catalogue temporaire vérifié. `--strategy` reste disponible pour les lancements directs limités à une famille. Sans `--model`, le wrapper démarre Codex sur `gpt-5.6-sol`, qui doit être disponible ; `--no-prompt` impose la même exigence.

Tous les échecs de découverte bloquent le lancement : erreur réseau, timeout, JSON invalide, HTTP 401/403, erreur serveur ou intersection vide. Les options `--direct`, `--proxy` et `--transport` ont été supprimées, car l’accès direct est désormais le seul transport Codex.

Au lancement, la session reçoit sept surcharges Codex : `model_provider`, `model`, `model_catalog_json`, le `name` du fournisseur, son `base_url`, `wire_api="responses"` et `env_key="OPENAI_API_KEY"`. Le token RouterLab est transmis sans modification au processus Codex via `OPENAI_API_KEY`. Les arguments natifs après `--` sont conservés, sauf ceux qui peuvent remplacer le routage ou la sélection validés par le wrapper : `-c`/`--config`, `-m`/`--model`, `--oss`, `--local-provider`, `-p`/`--profile`, `--remote` et `--remote-auth-token-env`. Utilise `--model` avant `--` pour choisir un modèle RouterLab autorisé.

Après une découverte réussie, le wrapper écrit un catalogue de démarrage temporaire contenant uniquement l’intersection entre les modèles découverts et ceux autorisés pour le service sélectionné, dans l’ordre configuré. Les métadonnées RouterLab sont normalisées pour Codex ; des valeurs conservatrices sont utilisées lorsque des champs optionnels manquent. Il n’existe aucun fallback en cas d’échec de découverte : le lancement s’arrête au lieu d’exposer un catalogue périmé. Cette liste est celle affichée par `/model`.

Le catalogue ne contient aucun identifiant, reste disponible uniquement pendant l’exécution du processus enfant Codex et est supprimé après un lancement réussi comme après une erreur. Le wrapper n’écrit jamais `config.toml`, `auth.json`, les réglages sandbox/approbation, MCP, profils ou autres préférences Codex.

Les destinations de production sont fixes : `routerlab` utilise `https://api.routerlab.ch/v1` et `llm` utilise `https://llm-api.routerlab.ch/v1`. Les valeurs utilisateur de `ROUTERLAB_BASE_URL`, `ROUTERLAB_LLM_BASE_URL`, `WRAPPER_SCIONOS_*_BASE_URL` et `ANTHROPIC_BASE_URL` sont ignorées avec un avertissement. Les variables de token restent prises en charge.

### Périmètre de l’exclusivité RouterLab

L’exclusivité RouterLab concerne uniquement le trafic de découverte et d’inférence des modèles configuré par le wrapper : liste des modèles et requêtes Responses du fournisseur sélectionné. Elle ne limite pas les fonctions réseau indépendantes du binaire officiel Codex, notamment ses vérifications de mise à jour, MCP, outils, recherche ou autres intégrations natives configurées par l’utilisateur. Le wrapper ne désactive, ne remplace et n’enrichit pas ces fonctions natives.

Quand Codex est choisi depuis le menu interactif, un échec de démarrage ou une sortie Codex non nulle affiche l’erreur et revient au menu principal. Une sortie Codex normale ferme le wrapper. Les commandes directes `codex launch` conservent le code de sortie du processus Codex.

`codex template` affiche les six réglages de routage du fournisseur et du modèle. Le chemin éphémère `model_catalog_json` est créé uniquement par `codex launch`, après la découverte des modèles. `codex status` et `codex restore` restent disponibles uniquement pour inspecter et nettoyer les configurations ou catalogues créés par d’anciennes versions. Un backup historique est restauré automatiquement ; sans backup, `config.toml` est toujours conservé et un nettoyage manuel est signalé. L’état d’exécution actuel est nettoyé automatiquement.

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
    npm run test:opencode-real
    npm audit
    npm pack --dry-run

`npm run test:entry-modes` empaquette l’arbre de travail courant dans un tarball temporaire, l’installe dans un préfixe isolé, puis ouvre et quitte le menu interactif via `wrapper-scionos`, `wrapper-scionos --service llm`, `npx wrapper-scionos` et `npx wrapper-scionos --service llm`. Il ne nécessite ni installation globale ni version npm déjà publiée.

`npm test` utilise l’injection de dépendances interne pour les fixtures locales ; les variables d’URL de production ne peuvent pas rediriger le wrapper. `npm run test:claude-real` valide le Claude Code installé face à des réglages locaux hostiles. `npm run test:codex-real` valide une vraie requête Codex non interactive contre un endpoint Responses local et vérifie via `app-server` que `model/list` expose le catalogue temporaire dans l’ordre attendu avec le modèle sélectionné actif. `npm run test:opencode-real` valide une vraie commande `opencode run` contre un endpoint OpenAI-compatible local et vérifie le proxy, l’authentification, le modèle et l’isolation de la configuration. Ces smoke tests utilisent uniquement de faux services loopback et ne contactent jamais RouterLab. Les seuils restent fixés à 85 % pour les lignes/fonctions et 80 % pour les branches.

Pour une version non publiée, crée un tarball local avec `npm pack`, puis teste-le avec `npx --yes --package ./wrapper-scionos-7.0.0.tgz wrapper-scionos`. Les instructions pour une version publiée restent `npm install -g wrapper-scionos` et `npx wrapper-scionos`.

Les détails d’architecture sont dans [docs/architecture-notes.md](./docs/architecture-notes.md).

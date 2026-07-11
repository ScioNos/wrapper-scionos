# wrapper-scionos

Wrapper en ligne de commande ScioNos pour Claude Code, Claude Desktop et Codex CLI connectés à RouterLab.

[Read in English](./README.md)

## Prérequis

- Node.js ^22.13.0 ou >=23.5.0.
- Un token RouterLab propre au service.
- Claude Code pour les lancements Claude Code.
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
    ROUTERLAB_BASE_URL
    ROUTERLAB_LLM_BASE_URL
    WRAPPER_SCIONOS_ROUTERLAB_TOKEN
    WRAPPER_SCIONOS_LLM_TOKEN
    WRAPPER_SCIONOS_ROUTERLAB_BASE_URL
    WRAPPER_SCIONOS_LLM_BASE_URL

ANTHROPIC_AUTH_TOKEN et ANTHROPIC_BASE_URL restent acceptées pendant la 4.x et émettent un seul avertissement de dépréciation sur stderr. Une `*_BASE_URL` personnalisée conserve son préfixe de chemin : `/gateway` suivi d’une requête Responses devient `/gateway/v1/responses` ; un `/v1` final est dédupliqué. Seules les bases HTTP(S) sont acceptées.

Le stockage sécurisé lit wrapper-scionos et l’ancien espace claude-scionos ; logout supprime les deux. Sous Linux, le fallback fichier crée les répertoires en `0700`, vérifie les fichiers de token en `0600` et échoue fermé si ces permissions ne peuvent pas être garanties.

auth login utilise une invite masquée. L’option --token fonctionne avec tous les clients, notamment auth test et strategies. Leur priorité est --token, variable d’environnement du service, puis stockage sécurisé. Codex conserve volontairement sa priorité particulière : --token, stockage sécurisé, puis environnement. Un token passé sur la ligne de commande peut rester visible dans l’historique du shell et dans l’inspection des processus.

## Claude Code

Claude Code est lancé via un proxy loopback. Les identifiants et mappings gérés par le wrapper ne sont injectés que dans le processus enfant ; les arguments inconnus après -- sont transmis à Claude Code.

    wrapper-scionos claude-code --service routerlab --strategy aws -- -p "Résume ce dépôt"

Le proxy n’impose aucun timeout total aux générations et ferme la requête upstream si le client se déconnecte.

## Claude Desktop

Le mode recommandé est le proxy local authentifié. L’application directe reste compatible pendant toute la 4.x, mais elle est dépréciée et prévue pour suppression en 5.0 :

    wrapper-scionos claude-desktop apply --service routerlab --dry-run
    wrapper-scionos claude-desktop apply --service routerlab --yes

Proxy local recommandé avec mapping :

    wrapper-scionos claude-desktop apply-proxy --service llm --yes
    wrapper-scionos claude-desktop proxy --service llm

`claude-desktop apply` persiste le token RouterLab en clair dans le profil Desktop et émet un avertissement explicite unique par processus. Sous Linux/macOS, chaque JSON contenant un credential est vérifié en `0600` et son répertoire de configuration en `0700` ; tout échec est fatal. `apply-proxy` ne stocke qu’un identifiant local aléatoire dans ce profil et constitue le mode normal.

apply-proxy résout le token RouterLab et démarre l’écoute avant d’écrire le profil. Un token absent, une annulation, un port occupé ou un échec d’écriture laisse le profil précédent intact et ferme toute nouvelle écoute. Il écrit atomiquement un identifiant aléatoire de 32 octets encodé en base64url et des métadonnées wrapperScionos versionnées. Un futur proxy sans option explicite reprend le service, la liste de stratégies, l’hôte loopback et le port stockés. Des options explicites divergentes sont refusées jusqu’à une réécriture avec apply-proxy --yes, ou avec --yes sur la commande proxy. Un ancien profil récupère hôte/port depuis inferenceGatewayBaseUrl, utilise le service CLI avec avertissement et reçoit les métadonnées v4 à la prochaine application. Un identifiant 3.x scionos-local est remplacé automatiquement avant l’écoute.

Le proxy écoute uniquement sur loopback. Toutes les routes GET/POST, y compris /v1/models, exigent l’identifiant du profil. Les origines navigateur sont refusées par défaut. Une origine HTTP(S) exacte peut être autorisée avec l’option répétable --allow-origin ; seul un préflight CORS OPTIONS correspondant peut répondre 204 sans authentification, sans exposer de données. Aucun CORS wildcard n’est émis.

Les requêtes sont limitées à 64 Mio avant et après décompression. Les corps identity, gzip, deflate et Brotli sont acceptés ; zstd l’est si le runtime Node actif l’expose, sinon HTTP 415 unsupported_content_encoding est retourné. Un JSON invalide retourne HTTP 400. La réception des en-têtes est limitée à 30 secondes et celle du corps à 120 secondes. Les générations longues n’ont pas de timeout total.

## Codex CLI

Le chemin Codex par défaut utilise le proxy local de session :

    wrapper-scionos codex launch --service routerlab
    wrapper-scionos codex launch --service llm

Pour le diagnostic uniquement, --direct contourne le proxy :

    wrapper-scionos codex launch --service llm --direct

Le wrapper ne surcharge que le fournisseur, le modèle, l’URL, le wire API et le catalogue temporaire. Il ne modifie ni le sandbox Codex, ni la politique d’approbation, ni l’effort de raisonnement, ni MCP, les features, les hooks, les fichiers d’authentification ou le mode web_search de l’utilisateur. Codex hérite donc de la préférence cached/live/disabled. L’outil de recherche n’est exposé que si les métadonnées RouterLab déclarent explicitement le modèle compatible.

En mode proxy, les requêtes Responses sortantes sont forcées à store: false. Le mode direct ne garantit aucune politique de stockage.

Le catalogue temporaire est généré depuis les métadonnées upstream normalisées. Si seuls les IDs sont disponibles, le fallback est conservateur : contexte 128k, texte uniquement, fonctions séquentielles, raisonnement medium, et aucune annonce non vérifiée de vision, outil hébergé, recherche, freeform ou appels parallèles. Les catalogues vieux de plus de 24 heures sont supprimés au démarrage et le catalogue actif est retiré à la sortie de Codex.

Tous les modèles RouterLab et RouterLab LLM sont envoyés sans transformation vers l’endpoint natif `/v1/responses` avec `wire_api="responses"`, en streaming comme hors streaming. RouterLab fournit la compatibilité Responses propre à chaque modèle ; le wrapper n’effectue aucune traduction de protocole. Il conserve l’authentification locale, le remplacement du token upstream, `store: false`, les catalogues temporaires et les diagnostics 401/403 contextualisés. Les réponses compressées relayées conservent encodage et longueur ; les erreurs compressées interceptées sont décodées de façon bornée avant normalisation.

codex template affiche un template non persistant. codex restore sert uniquement à restaurer une configuration écrite par une ancienne version.

## Compatibilité 4.x

Les éléments suivants restent acceptés pendant toute la 4.x et avertissent une seule fois par processus sur stderr :

- --proxy
- --transport proxy ou --transport direct
- ANTHROPIC_AUTH_TOKEN
- ANTHROPIC_BASE_URL
- --list-strategies (utiliser strategies)
- auth change (utiliser auth login)
- claude-desktop apply (utiliser claude-desktop apply-proxy)

Préfère le proxy par défaut, --direct pour le diagnostic et les variables RouterLab ci-dessus. Consulte [Migration depuis la 3.x](./docs/migration-4.0.md).

## Développement et portes de release

    npm test
    npm run test:coverage
    npm audit
    npm pack --dry-run

Pour une version non publiée, crée un tarball local avec `npm pack`, puis teste-le avec `npx --yes --package ./wrapper-scionos-4.0.0.tgz wrapper-scionos`. Les instructions pour une version publiée restent `npm install -g wrapper-scionos` et `npx wrapper-scionos`.

Les détails d’architecture sont dans [docs/architecture-notes.md](./docs/architecture-notes.md).

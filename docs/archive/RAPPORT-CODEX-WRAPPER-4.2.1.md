# Rapport d’analyse archivé — comportement Codex 4.2.1

> Archive historique : ce document décrit le proxy et le catalogue Codex de la version 4.2.1. Ces mécanismes ne font plus partie du chemin Codex 5.0 actuel.

# Rapport d'analyse — Comportement du wrapper sur Codex CLI

Analyse statique du code de `wrapper-scionos` v4.2.1, limitée au chemin Codex.
Aucun test n'a été exécuté ; toutes les affirmations ci-dessous proviennent de la
lecture des sources.

**Base de l'analyse** : tag `v4.2.1` (commit `0497592`), sur lequel la branche
`5.0.0-alpha` a été créée.

Fichiers analysés :

- `index.js`
- `src/cli/main.js`
- `src/cli/commands/codex.js`
- `src/apps/codex.js`
- `src/platform/llm-proxy.js`
- `src/routerlab/services.js`
- `src/routerlab/models.js`
- `README.fr.md`

---

## 1. Rôle du wrapper

Le wrapper est un intermédiaire entre le Codex CLI officiel et les deux endpoints
RouterLab :

| Service | Endpoint | Variables d'environnement token |
|---|---|---|
| `routerlab` | `https://api.routerlab.ch` | `ROUTERLAB_API_KEY`, `WRAPPER_SCIONOS_ROUTERLAB_TOKEN` |
| `llm` | `https://llm-api.routerlab.ch` | `ROUTERLAB_LLM_API_KEY`, `WRAPPER_SCIONOS_LLM_TOKEN` |

Point important : le wrapper **n'écrit pas** dans `~/.codex/config.toml` sur le
chemin `launch`. Tout passe par des surcharges de session `-c clé=valeur` et un
catalogue de modèles temporaire. `codex apply` a été retiré (`src/cli/main.js`),
`codex restore` ne sert plus qu'à nettoyer une config écrite par une ancienne
version.

---

## 2. Séquence de lancement

`launchCodexForService()` dans `src/cli/commands/codex.js` :

1. `assertCodexCliAvailable()` — exige Codex CLI >= `MINIMUM_CODEX_VERSION`.
2. Résolution du service et validation HTTP(S) de la base URL.
3. Résolution du token, dans cet ordre propre à Codex :
   `--token` → stockage sécurisé → variable d'environnement.
   (Claude Code utilise l'ordre inverse pour les deux derniers.)
4. `fetchModels()` sur `GET {base}/v1/models` avec un timeout de 10 s.
   - 401/403 → arrêt du lancement avant l'ouverture du proxy.
   - autre échec → avertissement, bascule sur le catalogue local.
5. Intersection entre les modèles retournés et la liste blanche du wrapper.
   Un modèle hors de cette intersection fait échouer le lancement.
6. Démarrage du proxy loopback, sauf `--direct`.
7. Écriture du catalogue temporaire dans `os.tmpdir()/wrapper-scionos-codex/`.
8. `launchCodex()` — `spawn` de Codex avec `OPENAI_API_KEY` injecté dans
   l'environnement de l'enfant uniquement.
9. `finally` — suppression du catalogue puis arrêt du proxy (grâce de 2 s).

---

## 3. Ce que le wrapper impose à Codex

### 3.1 Surcharges de session

`buildCodexRuntimeArgs()` dans `src/apps/codex.js` produit :

```
-c model_provider="custom"
-c model="<modèle>"
-c model_catalog_json="<catalogue temporaire>"
-c web_search="disabled"
-c model_providers.custom.name="<service>"
-c model_providers.custom.base_url="<base>/v1"
-c model_providers.custom.wire_api="responses"
-c model_providers.custom.env_key="OPENAI_API_KEY"
```

`web_search="disabled"` est la première contrainte comportementale : la recherche
hébergée est coupée pour toute la session, sans possibilité de la réactiver depuis
la ligne de commande du wrapper.


### 3.2 Catalogue de modèles substitué

`buildCodexModelCatalogEntry()` construit une entrée complète par modèle. Les
champs suivants sont décidés par le wrapper et non par l'upstream :

| Champ | Origine | Effet |
|---|---|---|
| `base_instructions` | constante du wrapper | remplace les instructions de base du modèle |
| `default_reasoning_level` | `CODEX_REASONING_PROFILES` | impose l'effort de raisonnement par défaut |
| `supported_reasoning_levels` | `CODEX_REASONING_PROFILES` | restreint les niveaux offerts dans l'UI |
| `shell_type` | `'shell_command'` en dur | pas d'outil freeform `apply_patch` |
| `supports_search_tool` | `false` en dur | recherche non annoncée |
| `experimental_supported_tools` | `[]` en dur | aucun outil expérimental exposé |
| `truncation_policy` | `{ bytes, 10000 }` en dur | plafond de troncature fixe |
| `default_reasoning_summary` | `'none'` en dur | pas de résumé de raisonnement |
| `support_verbosity` | `false` en dur | contrôle de verbosité retiré |
| `effective_context_window_percent` | `95` en dur | budget annoncé réduit de 5 % |

`base_instructions` par défaut :

```
You are Codex, a coding agent. Follow the active system, developer, and user instructions.
```

`MiniMax-M3` reçoit une variante spécifique déclarée dans `CODEX_MODEL_PROFILES` :

```
You are Codex, a coding agent based on MiniMax-M3. You and the user share the same
workspace and collaborate to achieve the user's goals.
```

**Point le plus intrusif** : le wrapper réécrit le prompt de base que Codex applique
au modèle.

### 3.3 Réécriture du corps des requêtes

`normalizeCodexResponsesRequest()` dans `src/platform/llm-proxy.js`, appliqué
uniquement sur `/responses` et `/v1/responses` :

```js
body.store = false;
delete body.metadata;
```

En mode proxy, aucune requête Codex Responses ne peut donc porter de `metadata` de
premier niveau ni demander la persistance côté fournisseur. En mode `--direct` le
wrapper ne touche pas au corps ; c'est Codex lui-même qui envoie `store: false`.

### 3.4 Liste blanche de modèles

```js
CODEX_ROUTERLAB_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
                          'deepseek-v4-pro', 'kimi-k2.7-code', 'glm-5.2'];
CODEX_LLM_MODELS       = ['gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-5.6-terra',
                          'kimi-k3', 'grok-4.5', 'MiniMax-M3'];
```

Un modèle réellement servi par RouterLab mais absent de ces tableaux est invisible
pour Codex, même quand `GET /v1/models` le retourne.

---

## 4. Fenêtres de contexte : valeurs supposées

`resolveCatalogMetadataValue()` privilégie une valeur upstream marquée vérifiée
(`contextWindowVerified !== false`). Sans métadonnée exploitable, il retombe sur
`CODEX_MODEL_PROFILES` :

| Modèle | Fenêtre repliée | Modalités | Parallel tool calls |
|---|---|---|---|
| `gpt-5.6-sol` | 372 000 | text, image | oui |
| `gpt-5.6-terra` | 372 000 | text, image | oui |
| `gpt-5.6-luna` | 372 000 | text, image | oui |
| `deepseek-v4-pro` | 1 000 000 | text | non |
| `kimi-k2.7-code` | 262 144 | text, image | non |
| `glm-5.2` | 200 000 | text | non |
| `kimi-k3` | 1 048 576 | text, image | non |
| `grok-4.5` | 500 000 | text, image | oui |
| `MiniMax-M3` | 1 000 000 | text, image | oui |
| inconnu | 128 000 | text | non |

Ces nombres sont des hypothèses de compatibilité héritées de cc-switch, pas des
maxima annoncés par les fournisseurs. Le budget transmis à Codex vaut 95 % de la
valeur retenue.

`CODEX_REASONING_PROFILES` restreint en parallèle les niveaux disponibles :

| Modèle | Défaut | Niveaux disponibles |
|---|---|---|
| `gpt-5.6-sol` | `low` | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-terra` | `medium` | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-luna` | `medium` | low, medium, high, xhigh, max |
| `deepseek-v4-pro` | `high` | none, high, max |
| `kimi-k2.7-code` | `high` | high uniquement |
| `glm-5.2` | `high` | none, high |
| `kimi-k3` | `max` | low, high, max |
| `grok-4.5` | `high` | low, medium, high |
| `MiniMax-M3` | `high` | none, high |

`kimi-k2.7-code` n'expose qu'un seul niveau : le sélecteur de raisonnement de
Codex devient inopérant pour ce modèle.

---

## 5. Ce que le wrapper ne touche pas

D'après le code lu et la documentation du dépôt :

- sandbox et politique d'approbation Codex
- effort de raisonnement choisi par l'utilisateur en session
- serveurs MCP, features, hooks
- `~/.codex/auth.json` (jamais réécrit ; `authPreserved: true` partout)
- `~/.codex/config.toml` en mode `launch` : tout passe par des `-c` de session

`codex template` n'écrit rien, il imprime seulement un aperçu. `codex restore`
n'existe que pour défaire une configuration laissée par une version antérieure du
wrapper, et refuse d'agir si le `config.toml` courant ne ressemble pas à un
config wrapper et qu'aucune sauvegarde n'existe.

---

## 6. Points de friction identifiés

1. **Prompt de base réécrit.** `base_instructions` court-circuite les
   instructions natives Codex pour chaque entrée du catalogue.
2. **Découverte de capacités neutralisée.** Codex lit le catalogue local ; il ne
   négocie plus avec l'upstream.
3. **Recherche web coupée par défaut**, sans option d'activation.
4. **`apply_patch` non annoncé.** `shell_type: 'shell_command'` force les
   éditions de fichiers par shell.
5. **`metadata` supprimé et `store` forcé** sur tout le trafic Responses proxifié.
6. **Liste blanche de modèles** qui masque toute nouveauté upstream jusqu'à mise
   à jour du wrapper.
7. **Fenêtres de contexte devinées** quand l'upstream ne renvoie pas de
   métadonnées vérifiées, avec un plancher à 128k pour les IDs inconnus.
8. **Niveaux de raisonnement restreints** par une table statique.

Chacun de ces points est localisé dans deux fichiers seulement,
`src/apps/codex.js` et `src/platform/llm-proxy.js`, ce qui rend la surface de
correction étroite.

---

## 7. Sécurité du proxy local

Points relevés dans `src/platform/llm-proxy.js` :

- Écoute sur loopback uniquement, port éphémère par défaut.
- Token gateway aléatoire de 32 octets base64url par session
  (`generateLlmProxyGatewayToken`). Le token RouterLab n'est jamais exposé à
  Codex ; le proxy le substitue côté upstream dans `forwardHeaders()`.
- Les en-têtes `authorization` et `x-api-key` entrants sont retirés avant
  transmission, ainsi que les en-têtes hop-by-hop.
- Corps limité à 64 Mio avant et après décompression ; gzip, deflate, brotli et
  zstd si le runtime l'expose.
- Pas de timeout total sur les générations ; `headersTimeout` 30 s,
  `requestTimeout` 120 s.
- Le token upstream reste en mémoire du processus wrapper, pas dans un fichier.

---

## 8. Cycle de vie du catalogue temporaire

- Emplacement : `os.tmpdir()/wrapper-scionos-codex/<service>-<uuid>-wrapper-scionos-model-catalog.json`
- Écriture atomique (fichier temporaire + `rename`).
- `cleanupStaleCodexRuntimeModelCatalogs()` supprime au démarrage tout catalogue
  de plus de 24 h.
- Le catalogue de la session est supprimé dans le `finally` de
  `launchCodexForService()`.

Un `kill -9` du wrapper laisse un catalogue orphelin, récupéré au lancement
suivant par la purge 24 h.

---

## 9. Synthèse

Le wrapper ne se contente pas de rediriger un endpoint : il **redéfinit
l'identité des modèles** vus par Codex. Le prompt de base, les niveaux de
raisonnement, les fenêtres de contexte, les outils annoncés, la recherche web et
la politique de troncature sont décidés dans `src/apps/codex.js`, pas négociés
avec RouterLab.

### Conséquences pratiques

1. Codex fonctionne sur les déclarations du wrapper, pas sur celles de l'upstream.
2. Toute capacité nouvelle côté RouterLab reste inaccessible jusqu'à une mise à
   jour du wrapper.
3. `apply_patch` est indisponible ; les éditions passent par `shell_command`.
4. La recherche web est inconditionnellement coupée.
5. `metadata` est silencieusement retiré des requêtes en mode proxy.
6. Un modèle RouterLab hors liste blanche est inutilisable.
7. Les fenêtres de contexte annoncées peuvent diverger des capacités réelles,
   dans les deux sens.

### Point positif

Ces choix sont concentrés dans un petit nombre de constantes d'un seul fichier, et
la mécanique de priorité aux métadonnées vérifiées existe déjà. Rendre le
comportement configurable ou davantage piloté par l'upstream ne demande pas de
refonte structurelle.

---

## 10. Opérations Git effectuées

Contexte initial : la branche `codex/5.0.0-beta` existait (locale et distante) avec
quatre commits post-v4.2.1. Elle a été **supprimée** car elle ne correspondait pas
au plan de versioning.

Opérations appliquées dans l'ordre :

1. `git branch -D 5.0.0-beta` — suppression locale de la branche créée par erreur.
2. `git push origin --delete 5.0.0-beta` — suppression distante.
3. `git branch 5.0.0-alpha v4.2.1` — création de la branche alpha sur le tag v4.2.1.
4. `git push -u origin 5.0.0-alpha` — publication de la branche alpha.

État vérifié après opération :

```
local  5.0.0-alpha : 0497592  (= v4.2.1 = main)
remote 5.0.0-alpha : 0497592
main               : 0497592
```

La branche `codex/5.0.0-beta` n'existe plus (locale ni distante). La branche
`5.0.0-alpha` est créée et publiée, basée sur `v4.2.1`.

Les quatre commits de l'ancienne `codex/5.0.0-beta` (`47587f6`, `b2ec806`,
`f1753e3`, `523b087`) ne sont plus référencés par aucune branche et seront
récupérés par le garbage collector git après expiration de leur période de grâce,
sauf s'ils sont explicitement réintégrés ailleurs.

---

## 11. Fichiers de référence

| Fichier | Rôle sur le chemin Codex |
|---|---|
| `src/apps/codex.js` | catalogue, profils, surcharges, chemins, lancement |
| `src/cli/commands/codex.js` | orchestration launch/template/restore/status |
| `src/platform/llm-proxy.js` | proxy loopback, réécriture Responses, erreurs |
| `src/routerlab/models.js` | `GET /v1/models`, normalisation des métadonnées |
| `src/routerlab/services.js` | endpoints, variables d'environnement, stockage |
| `src/cli/main.js` | routage CLI, validation d'options, menu interactif |

---

**Date de rédaction** : 2026-07-25  
**Version analysée** : wrapper-scionos v4.2.1 (tag `v4.2.1`, commit `0497592`)  
**Base de travail** : branche `5.0.0-alpha` créée sur `v4.2.1`

---

## 12. Comparaison avec Neko Route

**Neko Route** est un router local pour Codex développé en Rust (Tauri). Son approche
de la gestion de `config.toml` offre un éclairage intéressant sur les limites du
wrapper-scionos.

### Architecture de Neko Route

Source analysée : `D:\Serveurs\Productions\neko-route\src-tauri\src\codex_config.rs`

Neko Route expose un endpoint local OpenAI-compatible, génère le catalogue Codex et
**modifie directement** `~/.codex/config.toml`. Contrairement à wrapper-scionos qui
ne touche jamais au fichier en mode `launch`, Neko Route l'écrit à chaque injection.

### Stratégie de sauvegarde

```rust
let backup_path = backup_dir.join(format!("neko-route-{timestamp}.toml"));
fs::write(&backup_path, &original)?;
```

- Backup horodaté dans `~/.codex/config-backups/neko-route-YYYYMMDDTHHMMSSZ.toml`
- Manifeste de restauration `neko-route-restore.json` avec métadonnées
- Parsing TOML préservant le formatage, commentaires et ordre des clés

### Injection standard

En mode router local (injection par défaut) :

```rust
document["model_provider"] = value("neko-route");
document["model_catalog_json"] = value(catalog_path.display().to_string());
document["model"] = value(selected_model);
document["model_context_window"] = value(1_000_000);
document["model_auto_compact_token_limit"] = value(900_000);
```

Fenêtre de contexte fixe à **1M tokens** (90% auto-compact = 900K), identique à
wrapper-scionos. Le catalogue est persistant dans `~/.codex/`, pas temporaire.

### Mode Direct Provider (🔑 point clé)

Neko Route expose un **mode sans catalogue** :

```rust
if direct_provider {
    // 直连模式：不写模型目录，让 Codex 用上游服务商的真实模型列表
    document.as_table_mut().remove("model_catalog_json");
}
```

**Traduction du commentaire** : "Mode direct : ne pas écrire le répertoire de
modèles, laisser Codex utiliser la vraie liste de modèles du fournisseur upstream
(nos modèles ne participent pas)."

En mode `DirectProvider` :

- ❌ **Pas de `model_catalog_json`** — Codex interroge `/v1/models` directement
- ✅ **Slug upstream réel** — `model = "gpt-5.5"` tel quel, sans transformation
- ✅ **Reasoning forcé à xhigh** — `model_reasoning_effort = "xhigh"`
- ✅ **Fenêtre conservatrice** — 258K au lieu de 1M pour éviter de saturer l'upstream
- ✅ **Pas de `base_instructions` imposées** — Codex utilise les métadonnées natives

```rust
const DIRECT_PROVIDER_CONTEXT_WINDOW: u64 = 258_000;

if direct_provider {
    if let Some(slug) = default_model {
        document["model"] = value(slug); // slug upstream écrit directement
    }
    document["model_reasoning_effort"] = value("xhigh");
}
write_fixed_context_window(&mut document, DIRECT_PROVIDER_CONTEXT_WINDOW)?;
```

### Restauration

```rust
if manifest.config_existed {
    let backup = fs::read_to_string(&manifest.backup_path)?;
    fs::write(&manifest.config_path, backup)?;
} else if manifest.config_path.exists() {
    fs::remove_file(&manifest.config_path)?;
}
```

- Si l'ancien config existait → restaure depuis le backup horodaté
- Sinon → supprime le config créé par Neko Route
- Optionnellement supprime le catalogue (`delete_catalog: bool`)

### Comparaison des approches

| Aspect | wrapper-scionos | Neko Route |
|---|---|---|
| **Modifie config.toml** | ❌ Non (`-c` runtime seulement) | ✅ Oui (écriture TOML) |
| **Backup** | Ancienne version (v3.x) | Horodaté, traçable |
| **Restauration** | Retire config ancienne | Restaure backup original |
| **Catalogue** | Temporaire (tmpdir, nettoyé) | Persistant (`~/.codex/`) |
| **Mode sans catalogue** | `--direct` bypass proxy | `DirectProvider` supprime clé |
| **Parsing TOML** | Construction from scratch | Parse préservant format |
| **Fenêtre de contexte** | 1M fixe | 1M (router) / 258K (direct) |
| **Reasoning levels** | Table statique hardcodée | Déduits du provider protocol |

### Leçon pour wrapper-scionos 5.0

Le **mode Direct Provider** de Neko Route démontre qu'il est possible de router les
requêtes **sans redéfinir l'identité des modèles**.

Principes applicables :

1. **Supprimer `model_catalog_json`** quand on veut que Codex interroge l'upstream
   directement.
2. **Utiliser les slugs upstream réels** sans transformation ni alias.
3. **Ajuster la fenêtre de contexte** selon le mode : 1M pour un router local qui
   gère lui-même la compaction, 258K pour un mode direct où l'upstream reçoit les
   requêtes telles quelles.
4. **Ne pas imposer de `base_instructions`** — laisser Codex utiliser ses prompts
   natifs.
5. **Laisser l'upstream annoncer ses capacités** — reasoning levels, modalities,
   parallel tool calls.

Neko Route prouve qu'un wrapper peut **être transparent** : il route le trafic,
injecte l'authentification, observe les requêtes, mais **n'impose pas sa vision des
modèles** à Codex.

L'absence de ce mode dans wrapper-scionos 4.2.1 est le point de friction central :
le wrapper force Codex à voir les modèles comme **il** les définit, pas comme
RouterLab les expose.

---

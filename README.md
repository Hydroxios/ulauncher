# Uztik Launcher

Launcher desktop Minecraft basé sur Electron, Next.js et Tailwind, avec connexion Microsoft via `msmc` et lancement du jeu via `minecraft-launcher-core`.

Le launcher est pensé pour un seul pack custom piloté par un manifeste distant:
- connexion Microsoft
- préparation automatique de l'instance
- installation du profil Fabric
- téléchargement du zip du pack
- extraction du pack dans le dossier d'instance
- lancement de Minecraft

## Stack

- Electron
- Nextron / Next.js
- Tailwind CSS
- `msmc`
- `minecraft-launcher-core`
- `electron-store`

## Scripts

```bash
npm run dev
npm run build
```

## Fonctionnement du launcher

Au démarrage, le launcher:
1. restaure la session Microsoft si un `refreshToken` est présent
2. charge les settings locaux
3. récupère l'état du pack à partir de `MANIFEST_URL`

Au clic sur `Play`, le launcher:
1. recharge la session Microsoft
2. télécharge le manifeste du pack
3. vérifie si le pack est déjà installé dans le dossier d'instance
4. télécharge le profil Fabric correspondant
5. nettoie les dossiers gérés par le pack si une réinstallation est nécessaire
6. télécharge le zip du pack
7. extrait le zip dans l'instance
8. lance Minecraft avec `minecraft-launcher-core`

## Settings persistés

Les settings stockés localement sont:

```ts
type LauncherSettings = {
  memoryGb: number
  instanceDirectory: string
  openLogsOnLaunch: boolean
}
```

Valeurs importantes:
- `memoryGb`: mémoire max allouée au jeu
- `instanceDirectory`: dossier racine de l'instance Minecraft
- `openLogsOnLaunch`: ouvre la fenêtre de logs avant le lancement

## Manifest du pack

Le launcher attend un manifeste JSON distant avec ce format:

```json
{
  "packVersion": "1.0.0",
  "minecraftVersion": "1.21.4",
  "fabricLoaderVersion": "0.16.10",
  "packUrl": "https://example.com/modpacks/uztik-pack-1.0.0.zip"
}
```

### Schéma

```ts
type PackManifest = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  packUrl: string
}
```

### Champs

- `packVersion`: version logique du pack. C'est ce champ qui sert à savoir si une réinstallation est nécessaire.
- `minecraftVersion`: version Minecraft cible du pack.
- `fabricLoaderVersion`: version du loader Fabric à installer.
- `packUrl`: URL du zip du pack. Une URL relative est acceptée et sera résolue par rapport à l'URL du manifeste.

### Contraintes

- le manifeste doit être un JSON valide
- tous les champs sont obligatoires
- `packUrl` doit pointer vers un fichier zip téléchargeable
- le zip est traité comme un pack prêt à extraire dans la racine de l'instance

## Structure attendue du zip

Le zip du pack est extrait directement dans le dossier d'instance. Il peut par exemple contenir:

```text
mods/
config/
defaultconfigs/
kubejs/
resourcepacks/
shaderpacks/
```

Le launcher nettoie déjà ces dossiers avant une réinstallation:
- `mods`
- `config`
- `defaultconfigs`
- `kubejs`
- `resourcepacks`
- `shaderpacks`

Les données utilisateur non gérées par le pack, comme `saves`, ne sont pas supprimées par ce nettoyage.

## Cache et état local

Le launcher écrit un état local dans le dossier d'instance:

```text
.uztik-pack.json
```

Contenu attendu:

```ts
type InstalledPackState = {
  packVersion: string
  minecraftVersion: string
  fabricLoaderVersion: string
  fabricProfileId: string
  installedAt: string
}
```

Ce fichier sert à:
- savoir si le pack déjà présent est encore valide
- savoir si une mise à jour doit être appliquée
- retrouver le profil Fabric custom à lancer

Le zip téléchargé est mis en cache temporairement dans:

```text
.uztik-cache/
```

## Fabric

Le launcher ne passe pas par une sélection manuelle de version. Il récupère directement le profil Fabric via l'API officielle:

```text
https://meta.fabricmc.net/v2/versions/loader/<minecraftVersion>/<fabricLoaderVersion>/profile/json
```

Le profil reçu est écrit dans:

```text
<instanceDirectory>/versions/<fabricProfileId>/<fabricProfileId>.json
```

Ensuite `minecraft-launcher-core` lance ce profil custom avec:
- `version.number = minecraftVersion`
- `version.custom = fabricProfileId`

## Variable d'environnement du manifeste

Le launcher lit l'URL du manifeste depuis l'environnement:

```bash
MANIFEST_URL=https://example.com/manifest.json
```

Cette valeur n'est pas stockée dans les settings locaux et n'est pas éditable dans l'UI.

## Variable d'environnement du serveur

Le statut multijoueur est résolu à partir de l'environnement:

```bash
SERVER_ADDRESS=play.example.com
```

Tu peux aussi préciser le port:

```bash
SERVER_ADDRESS=play.example.com:25565
```

## Auth Microsoft

La connexion Microsoft est gérée avec `msmc`.

Le launcher:
- ouvre la fenêtre de login Microsoft
- stocke le `refreshToken`
- restaure la session au prochain lancement
- réutilise cette session pour récupérer les credentials Minecraft au moment du `Play`

## Fichiers principaux

- [main/background.ts](/mnt/f/mc/launchers/uztik/main/background.ts): logique Electron, auth, état du pack, lancement Minecraft
- [renderer/pages/home.tsx](/mnt/f/mc/launchers/uztik/renderer/pages/home.tsx): UI login, landing, settings
- [renderer/pages/logs.tsx](/mnt/f/mc/launchers/uztik/renderer/pages/logs.tsx): fenêtre de logs
- [main/preload.ts](/mnt/f/mc/launchers/uztik/main/preload.ts): bridge IPC renderer/main

## Limitations actuelles

- un seul pack custom à la fois
- pas de support CurseForge / Modrinth manifest natif
- pas de sélection de Java dans l'UI
- pas de vérification de hash/signature du zip de pack
- pas de rollback automatique si le téléchargement du pack échoue au milieu du process

## Exemple de workflow de prod

1. héberger `manifest.json`
2. héberger `modpack.zip`
3. incrémenter `packVersion` à chaque mise à jour de pack
4. laisser la même URL de manifeste
5. le launcher détectera le changement et réinstallera le pack au prochain lancement

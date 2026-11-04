# SONOFF TRV-ZBT Gen 2 — Installation et appairage

**Projet :** Maison — Domotique et régulation du chauffage  
**Date :** 4 novembre 2026  
**Statut :** Installation et appairage terminés

## 1. Configuration

- **Matériel :** 11 têtes thermostatiques SONOFF TRV-ZBT Gen 2.
- **Coordinateur :** SONOFF Dongle Max, connecté en Wi-Fi.
- **Firmware Zigbee du coordinateur :** Stable V1.0.0, EmberZNet SDK 7.4.5.
- **Logiciel :** Zigbee2MQTT 2.14.2, exécuté sur le Mac.
- **Interface Web :** http://localhost:8081
- **Canal Zigbee :** 20.
- **Firmwares des TRV :** 1.1.0 pour toutes les têtes sauf une, en 1.1.3.
- **eWeLink :** application iOS utilisée ponctuellement pour les mises à jour Bluetooth OTA ; non nécessaire à l'exploitation Zigbee.

Toutes les têtes sont désormais installées et appairées à Zigbee2MQTT.

## 2. Installation mécanique

Les TRV-ZBT Gen 2 utilisent un raccord standard **M30 × 1,5**, avec plusieurs adaptateurs fournis pour les autres systèmes.

Trois types de raccords ont été rencontrés dans la maison.

### A. Robinets M30 × 1,5

- Fixation directe de la base SONOFF sur le robinet.
- Aucun adaptateur ni rallonge de pointeau.
- Montage et calibration réalisés avec succès.

### B. Robinets COMAP M28 × 1,5

Utiliser l'adaptateur **M28 × 1,5** et, si nécessaire, l'une des quatre rallonges de pointeau fournies :

| Rallonge | Longueur |
|---|---:|
| H15.3 | 15,3 mm |
| H17.3 | 17,3 mm |
| H18.8 | 18,8 mm |
| H24.3 | 24,3 mm |

**Sens de montage :** la tête plate de la rallonge vient contre le pointeau métallique du robinet ; sa tige traverse le guide de l'adaptateur vers le moteur SONOFF.

Expérience acquise :

- Un premier robinet COMAP a été calibré avec succès avec H15.3.
- Un second robinet COMAP, apparemment similaire, a nécessité H17.3 après plusieurs échecs avec H15.3.
- Une rallonge trop courte peut empêcher le moteur d'atteindre correctement la course de fermeture.
- Une rallonge trop longue risque d'exercer une contrainte excessive sur la vanne.

**Méthode :** commencer avec une longueur justifiée par la géométrie du robinet ; si la calibration échoue, vérifier le montage avant d'envisager une autre longueur. Ne jamais forcer ni passer directement à la plus longue.

### C. Robinets Danfoss RA

Rencontrés notamment dans la chambre et la salle de bain.

Identification :

- Corps de vanne en laiton avec partie cylindrique cannelée.
- Fixation de l'ancienne tête Danfoss par encliquetage.
- Absence de filetage M28/M30 sur la zone de fixation.

Montage :

1. Placer l'adaptateur **Danfoss RA** sur la partie cannelée.
2. Insérer le petit écrou dans le logement hexagonal de l'adaptateur.
3. Introduire la vis par le trou opposé et serrer modérément.
4. Vérifier que l'adaptateur ne tourne pas et ne glisse pas.
5. Installer la tête et lancer la calibration.

**Aucune rallonge de pointeau n'est normalement nécessaire avec l'adaptateur RA.**

Ne pas confondre RA avec RAV, qui utilise une rallonge H13 mm, ou RAVL.

### Astuce de montage

Le verrouillage du corps électronique sur sa base s'est révélé parfois difficile : il arrivait que tout tourne ensemble sans que le verrouillage s'engage.

Une méthode plus pratique a été identifiée : **verrouiller d'abord le corps électronique sur sa base, puis fixer l'ensemble sur l'adaptateur du robinet**, lorsque la géométrie le permet.

Vérifier systématiquement que le corps est bien verrouillé et que l'ensemble est correctement fixé, sans serrage excessif.

## 3. Mise sous tension et calibration

Procédure initiale :

1. Installer deux piles AA 1,5 V en respectant leur polarité.
2. Attendre l'affichage `Ready`.
3. Fixer et verrouiller correctement la tête sur sa base.
4. Effectuer un appui bref sur le bouton central pour lancer `Calibrate`.
5. Attendre la fin du mouvement du moteur.
6. Vérifier la disparition de l'éventuelle erreur et le retour à l'affichage normal.

Dans Zigbee2MQTT, vérifier :

```json
{
  "motor_travel_calibration_status": "success",
  "fault_status": "none"
}
```

### En cas d'échec

Une **clé rouge** peut apparaître sur l'écran.

Causes rencontrées ou à vérifier :

- Rallonge de pointeau trop courte ou inadaptée.
- Corps électronique mal verrouillé.
- Adaptateur mal fixé ou mal positionné.
- Pointeau bloqué ou course de vanne incompatible.

Procédure de diagnostic :

1. Ne pas multiplier les calibrations identiques.
2. Vérifier la fixation mécanique.
3. Vérifier le centrage et la longueur de la rallonge si elle est utilisée.
4. Contrôler que le pointeau du robinet s'enfonce légèrement et revient librement, sans forcer.
5. Corriger le montage puis relancer la calibration.

**Recalibration depuis Zigbee2MQTT :**

Dans l'onglet *Exposes* de la tête, utiliser `valve_travel_calibration` avec la commande `calibrate`.

Cette méthode ne nécessite pas eWeLink ni notre futur serveur domotique Maison.

La documentation SONOFF prévoit également la reprise de la calibration initiale après remise sous tension, depuis l'état `Ready`.

## 4. Appairage avec Zigbee2MQTT

Une fois la tête installée et calibrée :

1. Ouvrir http://localhost:8081.
2. Cliquer sur **Autoriser l'appairage → Coordinateur**.
3. Sur la TRV, désactiver le verrouillage enfant si nécessaire.
4. Passer en mode manuel.
5. Tourner la molette jusqu'à `OFF`.
6. Maintenir le bouton central environ **2 secondes**.
7. Vérifier l'affichage `Network connecting` avec l'icône réseau clignotante.
8. Attendre que Zigbee2MQTT détecte et identifie l'appareil.
9. Renommer la tête selon sa pièce.
10. Désactiver l'autorisation d'appairage.

Le mode de recherche de la TRV dure environ trois minutes.

Les journaux Zigbee2MQTT permettent de suivre l'association, notamment les événements `Device joined`, `Interview started` et `Interview successful`.

L'appairage doit être effectué de préférence dans l'emplacement définitif de la tête afin de vérifier la couverture radio.

Si nécessaire, le corps électronique alimenté par ses piles peut être séparé de sa base et rapproché du coordinateur pour un test radio. Sa remise en place doit être suivie d'une vérification mécanique.

### Verrouillage enfant

- Maintien du bouton central pendant environ **3 secondes** pour activer/désactiver `Child Lock`.
- Depuis Zigbee2MQTT : paramètre `child_lock`, valeurs `LOCK` et `UNLOCK`.

## 5. Firmwares et mise à jour Bluetooth OTA

### Versions rencontrées

| Version | Observation |
|---|---|
| 1.0.9 | Une tête refusait totalement l'appairage Zigbee |
| 1.1.0 | Appairage fonctionnel, version actuellement proposée par Zigbee2MQTT |
| 1.1.3 | Installée sur une tête via eWeLink Bluetooth OTA ; appairage ensuite réussi |

### Problème initial résolu

La première tête refusait de rejoindre Zigbee2MQTT :

- Plusieurs essais d'appairage sans résultat.
- Aucun événement d'association dans les journaux, même en mode `debug`.
- Même échec à 10 cm du Dongle Max.
- Réseau Zigbee fonctionnel avec les autres capteurs.

La solution a été :

1. Installer eWeLink sur iPhone.
2. Accéder à l'outil **Bluetooth OTA**.
3. Détecter la tête par Bluetooth.
4. Mettre à jour son firmware de **1.0.9 vers 1.1.3**.
5. Refaire l'appairage Zigbee2MQTT.

**Résultat : appairage immédiatement réussi.**

Cette expérience suggère un problème lié au firmware 1.0.9 dans notre configuration, sans établir une incompatibilité générale de cette version.

### Particularité de la disponibilité des mises à jour

Zigbee2MQTT considère les têtes en 1.1.0 comme à jour, même si une tête possède déjà le firmware 1.1.3.

Explication : le dépôt OTA de Zigbee2MQTT propose actuellement la 1.1.0, tandis qu'eWeLink a pu proposer la 1.1.3 sur une unité.

Dans l'interface Bluetooth OTA d'eWeLink, les têtes déjà en 1.1.0 ou 1.1.3 ne présentent actuellement aucune nouvelle version disponible.

**Décision : conserver les firmwares fonctionnels et ne pas forcer les mises à jour.**

## 6. Bluetooth eWeLink : problème non résolu

Les têtes déjà appairées en Zigbee sont détectées dans eWeLink, mais la connexion Bluetooth directe échoue généralement.

Observations :

- Les appareils apparaissent dans les recherches Bluetooth.
- Le mode Bluetooth autonome s'active correctement.
- La connexion reste bloquée sur `Connexion Bluetooth`.
- Bluetooth OTA indique la version actuelle, mais laisse `Dernière version` vide.
- Le comportement est similaire sur les versions 1.1.0 et 1.1.3.
- Les permissions Bluetooth iOS d'eWeLink sont activées.

L'activation du Bluetooth depuis Zigbee2MQTT fonctionne :

```text
bluetooth_pairing: start
bluetooth_pairing_status: success
```

Cela confirme l'exécution de la commande, mais pas l'établissement d'une session Bluetooth avec eWeLink.

**Cause non identifiée.** Une interaction entre l'application iOS, ses sessions Bluetooth et les têtes déjà associées en Zigbee reste possible.

Les identifiants Bluetooth `TRV-ZBT-...`, le modèle de firmware `SN-TLSR8258-TRV-01`, les identifiants eWeLink et les adresses IEEE Zigbee sont distincts. Le suffixe variable des noms Bluetooth n'a pas été expliqué.

Ce problème ne compromet pas le fonctionnement de nos têtes dans Zigbee2MQTT.

## 7. Vérification après appairage

Contrôler pour chaque tête :

| Attribut | Vérification |
|---|---|
| `battery` | Niveau de piles cohérent |
| `motor_travel_calibration_status` | `success` |
| `fault_status` | `none` |
| `local_temperature` | Température plausible |
| `occupied_heating_setpoint` | Consigne correcte |
| `running_state` | `idle` ou `heat` |
| `linkquality` | Qualité de liaison à surveiller |
| `last_seen` | Communications récentes |
| `update.installed_version` | Firmware identifié |

Un état Zigbee connecté et une calibration réussie ne prouvent pas, à eux seuls, que la vanne ferme et ouvre hydrauliquement correctement. Ce fonctionnement devra être validé lors des cycles réels de chauffage.

**Ne pas interpréter `heating_valve_position: 100` comme la position instantanée de la vanne :** ce paramètre définit l'ouverture cible en phase de chauffe dans le mode de régulation classique.

## 8. Situation finale et suite du projet

**Installation mécanique : terminée.**  
**Calibration : effectuée.**  
**Appairage Zigbee2MQTT : terminé pour les 11 têtes.**  
**Firmware : 1.1.0, sauf une tête en 1.1.3.**

La phase suivante est consacrée à l'optimisation de la régulation :

- Étude des paramètres d'usine.
- Comparaison du mode classique et de `smart_temperature_control` (PID).
- Calibration des températures avec les capteurs SNZB-02B.
- Définition des réglages de confort et des consignes par pièce.
- Validation de l'ouverture et de la fermeture réelles des vannes.
- Coordination future des demandes de chauffage avec la chaudière Chappée via Shelly et notre serveur Maison.

## 9. Documentation

- [Notice officielle SONOFF TRV-ZBT Gen 2](https://support.sonoff.tech/trv-zbt-usermanual/)
- [Guide SONOFF : installation, fonctions et FAQ](https://sonoff.tech/en-fr/blogs/news/sonoff-trv-gen2-smart-radiator-valve-guide-installation-features-faq)
- [Fiche Zigbee2MQTT TRV-ZBT](https://www.zigbee2mqtt.io/devices/TRV-ZBT.html)
- [Documentation source Zigbee2MQTT](https://raw.githubusercontent.com/Koenkk/zigbee2mqtt.io/master/docs/devices/TRV-ZBT.md)

---

*Cette fiche documente les opérations réalisées et les résultats observés sur notre installation. Les correspondances d'adaptateurs et de rallonges doivent être vérifiées individuellement sur chaque robinet.*

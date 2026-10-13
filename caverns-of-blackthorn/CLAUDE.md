# Aktueller Stand: Modulüberarbeitung 0.2.1

Tokenhöhen sind relativ zur Szene. Monster-ActiveEffects verwenden native Core-14-Dauer {value, units: "seconds", expiry}; Aktivitäten referenzieren die IDs ihrer eingebetteten Effekte. Waffen benötigen die zur baseItem passende simple/martial-Kategorie. Journaltexte beschreiben ausschließlich die aktuelle Welt; Entwicklungsbegründungen bleiben hier oder in Arbeitsnotizen.

**Nutzerwunsch für alle Folgearbeiten:** ausschließlich offline testen. Keine Foundry-Testinstanz starten und keine Browser-Sichttests durchführen. Der Nutzer importiert selbst und meldet die Auffälligkeiten gesammelt.

- dnd5e 5.3.3: Bei ausdrücklich erzeugten `system.skills`-Einträgen immer das passende `ability` setzen. Ohne dieses Feld verwendet das System für diese Einträge DEX; die Initialisierung des richtigen Attributs greift nur für fehlende Einträge. Der Generator und ein Regressionstest berücksichtigen das.

Maßgeblich sind docs/HANDOFF.md und docs/UMBAU-REGELN.md. Die nachfolgende ältere technische Dokumentation bleibt als Hintergrund erhalten; diese geprüften Änderungen gehen ihr vor:

- Ziel: Foundry 14.364 / dnd5e 5.3.3. Neun Szenen, zehn Orte, 18 Abenteuer-Statblocks, sieben Gegenstände und 21 Journalseiten. Die Platzhalterszene ist ersetzt.
- Karten nutzen 60 Pixel pro 5-ft-Feld. Quellenkoordinaten sind Pixel in der skalierten Szenenfläche (`coordinateScale: 1`). Kein Szenenrand. Boden-Tokens haben elevation 0; Höhlentiefen aus der Wege-Datei sind reine Ortsinformationen. Core 14 verlangt ein ganzzahliges Raster ab 20 Pixel, nicht pauschal 50 Pixel.
- XP-Budgets sind Obergrenzen: <=3.000 niedrig, <=5.200 mittel, <=6.800 hoch; darüber Überschreitung. Keine Verdoppelung des hohen Budgets als normale Kategorie.
- Build benutzt die exportierte API `compilePack(src, dest)` aus @foundryvtt/foundryvtt-cli. Der CLI-Prozess selbst greift beim Start auf globale AppData-Konfiguration zu; die API vermeidet das und funktioniert unter Windows.
- Core-14-ActiveEffects: `type: "base"`, `system.changes` mit `type: "add"`/`"override"`/`"upgrade"`. Keine alten numerischen change modes in den erzeugten Dokumenten. NPC-Quellenfeld steht unter `system.source`.
- Mehrere Token-Gruppen desselben Actors in einer gemeinsamen Szene benötigen `area` und gegebenenfalls eigene Gruppen-ID. Pins benutzen `key` zusätzlich zu `area`. Verifier prüft alle Szenen, nicht nur die erste.
- Targs Zauber verwenden `cast`-Aktivitäten mit bestätigten PHB-UUIDs. Verbrauch wird über `itemUses` erfasst; vorhandenes PHB erforderlich. MM-Bilder und Tokens bleiben externe Referenzen; MM ist erforderlich.
- Externe Ziele stehen in build/reference-index.json, geprüft gegen die bereitgestellten Paketversionen. Für erneute Assetprüfung --core und --data an verify.mjs übergeben. Keine Lizenzdatei oder Vollpakete ins Repository übernehmen.
- verify-core.mjs lädt echte Core-Dokumentklassen, aber keine dnd5e-Clientmodelle. Ein grüner Lauf ist Strukturprüfung, keine Behauptung eines erfolgreichen Live-Imports.

---

# CLAUDE.md — Arbeitsanleitung für dieses Modul

> **Halte diese Datei aktuell.** Wenn du etwas über das Foundry-Pack-Format, das
> dnd5e-Schema oder die Konvertierung lernst, schreib es hier auf — im selben
> Change. Das gehört zu "fertig".

> **Inhaltliche Entscheidungen stehen in [`docs/`](docs/).** `docs/HANDOFF.md` ist der
> Einstieg, `docs/UMBAU-REGELN.md` sagt, wie Inhalt ins Modul kommt — **vor Arbeit an
> `src/` lesen.** Diese Datei hier deckt nur Technik ab.

## Was das ist

**Die Höhlen von Blackthorn** (`id: caverns-of-blackthorn`) ist ein
**Content-Modul** für Foundry VTT v13+/dnd5e 5.x — kein Code-Modul. Es hat keine
`esmodules`, kein JavaScript zur Laufzeit. Alles, was es tut, steckt in seinen
Compendium-Packs.

Es liegt im Repository `darkviruzz-tweaks` in einem Unterordner, ist aber ein
**eigenständiges Foundry-Modul** mit eigener `module.json` und eigenem Build. Der
Ordner ist 1:1 in ein eigenes Repository verschiebbar.

## Nicht verhandelbare Konventionen

1. **Quellen sind YAML unter `src/`, niemals handgeschriebene Pack-Dateien.**
   Ein echter dnd5e-NPC ist ~600 Zeilen Boilerplate; die Quellen hier führen nur,
   was vom Schema-Default abweicht. Foundry füllt den Rest beim Laden auf.
2. **IDs sind deterministisch** (`build/lib/ids.mjs`). Das Adventure verweist auf
   Actors und Journalseiten per ID, Szenen-Tokens speichern `actorId`. Zufällige
   IDs würden bei jedem Rebuild sämtliche Referenzen zerreißen.
3. **Zahlen werden berechnet, nicht getippt.** XP-Summen, Budget-Einordnungen und
   Angriffsboni entstehen im Generator. Bei 500 Kreaturen ist eine handgepflegte
   Summe nach der ersten Änderung falsch.
4. **`build/verify.mjs` muss grün sein, bevor etwas ausgeliefert wird.** Foundry
   meldet kaputte Referenzen nicht — es rendert sie einfach als Nichts.
5. **Texte sind Neufassungen, keine Übersetzungen.** Siehe Abschnitt "Herkunft" im
   README. Fakten aus der Vorlage übernehmen, Prosa selbst schreiben.
6. **Deutsch** für alle Inhalte (Journal, Kreaturennamen, Gegenstände).

## Architektur

```
module.json           Manifest, Pack-Deklarationen, dnd5e-relationship
package.json          Build-Skripte, foundryvtt-cli als devDependency
build/
  build.mjs           Orchestrierung: YAML -> Dokumente -> dist/ -> packs/
  verify.mjs          Liest die Packs zurück, prüft jede Referenz
  make-map.py         Rendert die Platzhalterkarte
  make-banner.py      Rendert das Clan-Banner
  lib/
    ids.mjs           Deterministische 16-Zeichen-IDs aus einem Seed
    keys.mjs          _key-Vergabe entlang der CLI-Hierarchie  <- KRITISCH
    actors.mjs        Kreaturendefinition -> dnd5e-NPC (mit Validierung)
    items.mjs         Gegenstandsdefinition -> dnd5e-Item (mit Active Effects)
    journal.mjs       Journalquelle -> JournalEntry, rendert Begegnungsblöcke
    scene.mjs         Szenenquelle -> Scene (Tokens, Lichter, Pins)
    adventure.mjs     Bündelt alles in ein Adventure-Dokument
src/
  creatures/*.yml     19 Statblocks
  items/*.yml         Der Hort des Oger-Häuptlings
  journal/*.yml       Der Abenteuertext samt Begegnungsdaten
  scene/*.yml         Szenengeometrie, Beleuchtung, Tokenformationen
assets/maps/          Platzhalterkarte (generiert)
docs/                 Lore, NPCs, Aufhänger, Karten, Umbau-Regeln (kein Build-Input)
packs/                LevelDB, gitignored — entsteht beim Build
```

## Prüfung in CI und Release

Der Workflow liegt **im Wurzelverzeichnis des Repos**: `.github/workflows/blackthorn.yml`
(GitHub führt nur Workflows von dort aus — die frühere Kopie unter
`caverns-of-blackthorn/.github/` ist deshalb nie gelaufen und wurde entfernt).

- **Jeder PR / Push auf `main`, der diesen Ordner berührt:** `npm ci`, `npm test`,
  `npm run build`, `npm run verify` — offline, ohne Foundry. `verify-core.mjs` und die
  `--core/--data`-Prüfung von `verify.mjs` brauchen eine lokale Foundry-Installation und
  laufen dort nicht.
- **Release:** `version` in `module.json` erhöhen, mergen, dann Tag
  `cob-v<version>` pushen (muss zur `module.json` passen) oder den Workflow manuell
  starten (veröffentlicht die Version aus `module.json`). Der Workflow rendert Karte und
  Banner neu, baut, prüft, setzt `manifest`/`download` ein und veröffentlicht
  `module.json` + `caverns-of-blackthorn.zip`.
- **Niemals als „Latest" markieren.** Die Manifest-URL des Tweaks-Moduls lautet
  `releases/latest/download/module.json` — ein Blackthorn-Release als „Latest" würde allen
  Tweaks-Installationen das Blackthorn-Manifest unterschieben. Der Workflow setzt deshalb
  `make_latest: false` (ohne Angabe setzt die GitHub-API ein neues Release auf „Latest").
- **Stabile Manifest-URL:** Jedes Release aktualisiert zusätzlich das rollende Release
  `cob-latest`; Foundry installiert und aktualisiert über
  `https://github.com/darkviruzz/darkviruzz-tweaks/releases/download/cob-latest/module.json`.
- **Umzug in ein eigenes Repository:** den Workflow mitnehmen, `working-directory` und die
  Pfad-Präfixe entfernen; dort kann das Manifest dann wieder `releases/latest/…` nutzen.

## Verifizierte Fakten & Fallstricke

### Foundry-Compendium-Packs (v11+)

- **Packs sind LevelDB-Verzeichnisse, kein JSON.** Sie lassen sich nicht als lose
  Dateien ausliefern. Gebaut wird mit `@foundryvtt/foundryvtt-cli`
  (`fvtt package pack`), das intern `classic-level` benutzt.

- **GRÖSSTER FALLSTRICK: `_key` ist Pflicht, und sein Fehlen ist lautlos.**
  Der Packer macht `if (!doc._key) continue` — ein Dokument ohne Key wird
  übersprungen, ohne Warnung, mit Exit-Code 0. Ergebnis: ein leeres Pack, das
  aussieht wie ein erfolgreicher Build. Genau das ist hier einmal passiert.
  `build/lib/keys.mjs` vergibt die Keys; `build/verify.mjs` fängt den Fall.

- **Key-Format** ist `!<Collection-Pfad>!<ID-Pfad>`, beide mit `.` verbunden, und
  gilt rekursiv für eingebettete Dokumente:
  ```
  !actors!ACTORID
  !actors.items!ACTORID.ITEMID
  !actors.items.effects!ACTORID.ITEMID.EFFECTID
  !journal.pages!JOURNALID.PAGEID
  !scenes.tokens!SCENEID.TOKENID
  ```
  Die maßgebliche Hierarchie steht in `node_modules/@foundryvtt/foundryvtt-cli/lib/package.mjs`
  als Konstante `HIERARCHY`; `build/lib/keys.mjs` spiegelt sie.

- **Adventures kommen in `HIERARCHY` nicht vor.** Deshalb bleiben ihre Inhalte
  (`actors`, `scenes`, `journal`, `items`, `folders`) **inline im gespeicherten
  Wert**, statt eigene Keys zu bekommen. Genau das ermöglicht den Ein-Klick-Import.
  Ein Adventure braucht nur `!adventures!<id>`.

- **CLI-Aufruf:** `fvtt package pack -n <name> --id <modul> --type Module --in <dir> --out <packs-dir>`.
  Der Pack-Name muss über `-n` kommen — als positionales Argument wird er
  stillschweigend ignoriert.

- **Adventure-Inhalte müssen tief kopiert werden.** Ein flacher Spread teilt die
  eingebetteten Arrays (Actor-Items, Journal-Pages) mit den Einzelpacks. Die
  `_key`-Vergabe mutiert in place, also würde das Keyen eines Packs Fremdkeys in
  die Dokumente des anderen stempeln — und der Build wäre nur in genau einer
  Reihenfolge korrekt. `adventure.mjs` nutzt `structuredClone`.

- `js-yaml` **v5** (das die CLI mitbringt) hat keinen ESM-Default-Export. Für
  eigene Skripte explizit `js-yaml@^4` installieren.

### dnd5e 5.x (verifiziert gegen release-5.3.3)

> dnd5e-Tags heißen `release-5.3.3`, nicht `5.3.3` — nackte Tag-URLs auf
> raw.githubusercontent.com laufen ins 404. Repo klonen.

- **Der Attributsmodifikator wird automatisch auf den Waffenschaden addiert.**
  Ein zusätzliches `damage.base.bonus` in Höhe des Modifikators verdoppelt ihn —
  und der Statblock sieht trotzdem plausibel aus, weil der Enricher die verdoppelte
  Zahl brav ausgibt. `validate()` in `actors.mjs` fängt das.
  Referenz: Der SRD-Oger hat `2d8` plus Stärke 19, und der Statblock zeigt `2d8+4`.

- **Beschreibungen sollen Enricher benutzen, keine ausgeschriebenen Zahlen:**
  `[[/attack extended]]` und `[[/damage average extended]]` rendern Trefferbonus
  und Durchschnittsschaden aus der Aktivität. Damit können Text und Mechanik nicht
  auseinanderlaufen.

- **Monster-Aufbau:** passive Eigenschaften sind `feat`-Items mit
  `properties: ["trait"]`, Angriffe sind `weapon`-Items mit einer
  `attack`-Aktivität, Mehrfachangriff ist ein `feat` ohne Aktivität, dessen Text
  per `[[/item .<ItemID>]]` auf die Angriffe verweist. `{{item:Name}}` in den
  Quellen wird dazu aufgelöst; `validate()` prüft, dass die Kreatur das genannte
  Item wirklich hat (ein Tippfehler erzeugt sonst eine ID, die auf nichts zeigt).

- **`[[lookup @name lowercase]]{monster}`** setzt in SRD-Texten den Kreaturennamen
  ein. Hier nicht verwendet, weil die deutschen Texte den Namen ohnehin ausschreiben.

- **XP nach HG** stehen in `CONFIG.DND5E.CR_EXP_LEVELS`, die **Begegnungsbudgets
  des DMG 2024** in `CONFIG.DND5E.ENCOUNTER_DIFFICULTY` (Index = Charakterstufe,
  Werte `[niedrig, mittel, hoch]` pro Charakter). Beide sind in
  `journal.mjs` bzw. `actors.mjs` gespiegelt. Stufe 7 = `[750, 1300, 1700]`.

- **Im 2024er SRD fehlen** Ork, Duergar, Steeder und Rothé — vorhanden sind
  `Gnoll Warrior` (jetzt **Unhold**), `Ogre` und `Giant Spider`. Die fehlenden
  vier sind hier eigene Statblocks.

- **Active Effects auf Gegenständen** brauchen `transfer: true`, damit sie auf den
  Träger wirken, statt über eine Chatkarte angewendet werden zu müssen. Relevante
  Keys: `system.attributes.ac.bonus`, `system.bonuses.abilities.save`,
  `system.bonuses.abilities.check`, `system.bonuses.abilities.skill`.
  Änderungsmodus 2 = ADD, 5 = OVERRIDE, 4 = UPGRADE.

### Journals und Assets

- **Pins binden an das Journal mit `area`-getaggten Seiten**, nicht an `journals[0]`.
  Sonst zeigt das Hinzufügen eines zweiten Journal-Eintrags je nach
  Dateinamen-Sortierung stillschweigend auf das falsche Dokument.
- **`verify.mjs` prüft jeden `modules/caverns-of-blackthorn/...`-Pfad** im gesamten
  Adventure-JSON gegen die Platte — Szenenhintergrund, Banner, Portraits,
  Token-Texturen und in Journal-HTML eingebettete Bilder. Eine fehlende Datei
  rendert in Foundry als kaputtes Bild, ohne dass irgendetwas geloggt wird.
- **Zwei Skripte dürfen nicht denselben Dateinamen schreiben.** `make-map.py` und
  `make-banner.py` haben sich einmal gegenseitig die `blackthorn-banner.webp`
  überschrieben — je nachdem, welches zuletzt lief. Die Karte heißt jetzt
  `blackthorn-map-preview.webp`.

### Szenen

- **Raster:** Die Vorlage rechnet in 10-Fuß-Feldern, dnd5e in 5-Fuß-Feldern. Die
  Szenenquelle führt deshalb Kartenzellen zu 10 Fuß, und `scene.mjs` setzt
  `grid.size = cellPixels / 2` bei `grid.distance = 5`. Ein mittelgroßer Token
  belegt so ein 5-Fuß-Feld, und ein Kartenquadrat sind 2×2 Felder.
- **Notiz-Pins** brauchen `entryId` **und** `pageId`. Ein fehlender `pageId`
  öffnet beim Klick nichts — ohne jede Fehlermeldung. `verify.mjs` prüft beides.
- **Tokengrößen** kommen aus der Kreatur (Groß = 2×2), nicht aus einem Default.
  Der `bestiary`-Map in `build.mjs` trägt `size` genau dafür.
- Alle platzierten Tokens starten `hidden: true`.

## Konvertierungsentscheidungen

Sie stehen im Journal auf der Seite **"Anmerkungen zur Konvertierung"** — bewusst
im Produkt und nicht nur hier, damit die Spielleitung sie am Tisch sieht und
zurückdrehen kann. Wenn du eine änderst, ändere beide Stellen.

## Inhalt und Chronologie

Der Kanon steht in [`docs/LORE.md`](docs/LORE.md); Personen in
[`docs/NPCS.md`](docs/NPCS.md), Aufhänger in [`docs/HOOKS.md`](docs/HOOKS.md).

Zwei Regeln, die den Code betreffen:

- **Zeit wird relativ erzählt** („vor gut einem Jahrzehnt", „im letzten Herbst",
  „tiefer Winter"). Keine Jahreszahlen im Inhalt — so bleibt das Modul an den
  Kampagnen-Zeitstrahl anschließbar.
- **`docs/` ist die Quelle, das Journal folgt.** Wer eine Lore-Aussage ändert, ändert
  sie dort und zieht `src/journal/blackthorn.yml`, `src/journal/lore.yml` und die
  Kommentare in `src/creatures/blackthorn-clan.yml` nach.

## Was noch offen ist

- **Zehn handgezeichnete Karten ersetzen die Platzhalterkarte.** Rasterwerte, Szenen-
  und Pinlisten stehen in [`docs/KARTEN.md`](docs/KARTEN.md).
- **Wände kommen mit den echten Karten.** `scene.mjs` nimmt `walls` bereits entgegen;
  die Terrainwände am Spalt (`move: 20`, `sight: 0`) sind in `docs/KARTEN.md` spezifiziert.
- **Mehrere Pins je Szene** brauchen ein optionales `key`-Feld im Notiz-Eintrag; die
  Notiz-ID wird dann `note:<szene>:<key ?? area>`.
- **Keine Zufallsbegegnungstabelle.** Die Alarmstufen decken das ab.

Die vollständige Arbeitsliste steht am Ende von
[`docs/UMBAU-REGELN.md`](docs/UMBAU-REGELN.md).

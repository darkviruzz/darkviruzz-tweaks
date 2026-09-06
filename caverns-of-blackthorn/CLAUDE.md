# CLAUDE.md — Arbeitsanleitung für dieses Modul

> **Halte diese Datei aktuell.** Wenn du etwas über das Foundry-Pack-Format, das
> dnd5e-Schema oder die Konvertierung lernst, schreib es hier auf — im selben
> Change. Das gehört zu "fertig".

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
  lib/
    ids.mjs           Deterministische 16-Zeichen-IDs aus einem Seed
    keys.mjs          _key-Vergabe entlang der CLI-Hierarchie  <- KRITISCH
    actors.mjs        Kreaturendefinition -> dnd5e-NPC (mit Validierung)
    items.mjs         Gegenstandsdefinition -> dnd5e-Item (mit Active Effects)
    journal.mjs       Journalquelle -> JournalEntry, rendert Begegnungsblöcke
    scene.mjs         Szenenquelle -> Scene (Tokens, Lichter, Pins)
    adventure.mjs     Bündelt alles in ein Adventure-Dokument
src/
  creatures/*.yml     15 Statblocks
  items/*.yml         Der Hort des Oger-Häuptlings
  journal/*.yml       Der Abenteuertext samt Begegnungsdaten
  scene/*.yml         Szenengeometrie, Beleuchtung, Tokenformationen
assets/maps/          Platzhalterkarte (generiert)
packs/                LevelDB, gitignored — entsteht beim Build
```

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

## Was noch offen ist

- **Die Karte ist ein Platzhalter.** Ersetzt wird sie durch eine handgezeichnete
  Karte (Dungeondraft / Dungeon Alchemist); die Anleitung steht im README und als
  Kommentar in `src/scene/blackthorn.yml`.
- **Keine Wände.** Bewusste Entscheidung — bei einer Karte, die ohnehin ersetzt
  wird, wären sie doppelte Arbeit. Wenn die endgültige Karte steht, lohnt ein
  Wall-Layer; `scene.mjs` nimmt `walls` bereits entgegen.
- **Keine Zufallsbegegnungstabelle.** Die Alarmstufen im Journal decken das ab.

# Die Höhlen von Blackthorn

Ein Foundry-VTT-Modul für **dnd5e (D&D 2024)**: ein Humanoiden-Hort tief unter dem
Gnarley-Forst, südöstlich von Dyvers. Fan-Konvertierung einer AD&D-2e-Vorlage,
gerechnet für **vier Charaktere auf Stufe 7**.

| | |
|---|---|
| **Foundry VTT** | v13+ (verifiziert auf v14) |
| **System** | dnd5e 5.x (D&D 2024) |
| **Sprache** | Deutsch |

## Was drin ist

Ein **Adventure-Dokument** für den Ein-Klick-Import. Es legt an:

- **Eine Szene** — 730 × 450 ft auf 5-ft-Raster, mit Beleuchtung (die Fontäne als
  grelle Lichtquelle, Fackeln und Kochfeuer im Ogerbau, Tageslicht durch den
  Deckenschacht), 60 vorplatzierten, verborgenen Tokens und Journal-Pins für alle
  sieben Bereiche.
- **Zwei Journals mit vierzehn Seiten:**
  - *Die Höhlen von Blackthorn* — Überblick, Bereiche 1–7, Begegnungsbudgets und
    Skalierung, offengelegte Konvertierungsentscheidungen.
  - *Lore, Fraktionen & Aufhänger* — die Blackthorn-Haine an der Oberfläche, der
    Clan samt Machtwechsel, sechs ausgearbeitete Aufhänger mit je drei
    Auflösungswegen, und eine Liste dessen, was sich im Bau erreichen lässt.
- **19 Statblocks** nach 2024er Bauweise: Orks (Krieger, Veteran, Sippe), Gnolle
  (Krieger, Matriarchin, Rudelführer), Oger (Krieger, Matriarchin, Jungtier,
  Häuptling), Duergar (einfach, Anführer, Häuptling), Steeder, Rothé — sowie
  **Garghuk**, **Targ**, Bugbear-Schleicher und Hobgoblin-Drillmeister.
- **Den Hort des Oger-Häuptlings** — sechs magische Gegenstände samt Active
  Effects, plus das Fläschchen mit leuchtendem Wasser.

## Installation

Modul-Verzeichnis nach `Data/modules/caverns-of-blackthorn/` entpacken, Foundry
neu starten, Modul in der Welt aktivieren. Dann **Compendium → Blackthorn —
Abenteuer (Import)** öffnen und importieren.

## Wie das Abenteuer gedacht ist

**Blackthorn kann nicht leergekämpft werden**, und das ist der Entwurf, keine
Warnung. Im Bau leben rund 300 Ork-Krieger, 85 Gnolle und 76 Oger — zusammen über
90.000 XP gegen ein Budget von 6.800 XP für einen harten Kampf auf Stufe 7.

Die Begegnungen im Journal sind deshalb **Ausschnitte**: der Wachposten, ein
Jagdtrupp, der Häuptling mit seiner Leibwache, ein Duergar-Spähtrupp. Jede trägt
ihre XP-Summe und die Einordnung gegen das Gruppenbudget. Die Gesamtbevölkerung
steht als Kulisse daneben, mit ausgewiesener Einordnung "nicht als Kampf gedacht".

Der Bruch, den eine Gruppe ausnutzen kann, steht schon in der Vorlage: die Orks
haben keine Anführer mehr — die Oger haben sie erschlagen — und sie sind fünfmal
so zahlreich wie ihre Herren.

### Zwei Zeitstände

Die Quellen zu diesem Ort widersprechen sich: die ältere beschreibt einen Ogerhort
mit 76 Ogern und führungslosen Orks, die jüngere einen **Blackthorn-Orc-Clan**
unter Garghuk, mit nur noch 20–28 Ogern, dafür Hobgoblins und Bugbears.

Das Modul löst das als Zeitachse auf — dazwischen liegt ein **Aufstand
(Coldeven 575 CY)**. Beide Stände sind bespielbar; die Bereichsbeschreibungen
gelten für beide, weil sich die Geografie nicht ändert. Der Standard ist der
neuere Stand.

## Die Karte austauschen

Die mitgelieferte Karte ist ein **Platzhalter**, prozedural gezeichnet von
`build/make-map.py` in der Topologie der Vorlage. So ersetzt du sie:

1. Bild nach `assets/maps/` legen, `background` in `src/scene/blackthorn.yml`
   anpassen.
2. `cellPixels` auf die Pixel pro **10-Fuß-Zelle** deiner Karte setzen (bei einem
   Dungeondraft-Export mit 128 px pro 5-ft-Feld also 256).
3. `widthCells` / `heightCells` = Bildmaße geteilt durch `cellPixels`.
4. Die Ankerpunkte (`around`, `at`) auf die Bereiche deiner Karte ziehen.

Alle Koordinaten in der Szenenquelle stehen in 10-ft-Kartenzellen, nicht in
Pixeln — es sind rund 20 Zahlen, alles andere rechnet sich daraus.

## Bauen

```bash
npm install
npm run build      # erzeugt packs/ als LevelDB
node build/verify.mjs
```

Der Build liest die YAML-Quellen unter `src/`, expandiert sie zu vollständigen
Foundry-Dokumenten und packt sie mit der offiziellen Foundry-CLI. `verify.mjs`
liest die Packs zurück und prüft, dass jede Referenz auflöst — Token auf Actor,
Pin auf Journalseite, `@UUID` auf Compendium-Eintrag.

Siehe **[CLAUDE.md](CLAUDE.md)** für die Architektur und die Fallstricke des
Pack-Formats.

## Herkunft und Rechtliches

Dies ist eine **Fan-Konvertierung**, kein offizielles Produkt, und steht in keiner
Verbindung zu Wizards of the Coast.

Die Vorlage ist eine Location aus einem AD&D-2e-Abenteuer von 2000. Übernommen
sind daraus die **Fakten**: Bevölkerungszahlen, Raumtopologie, Tiefenangaben,
Fraktionen, Schätze und Aufhänger — Fakten sind nicht urheberrechtlich geschützt.
**Neu geschrieben** sind sämtliche Texte; sie sind keine Übersetzung der Vorlage.
**Neu gebaut** sind alle Statblocks — eine Umrechnung Wert für Wert ergibt in 5.5e
ohnehin keine funktionierenden Monster. Die Karte ist eine eigene Zeichnung.

Statblocks orientieren sich, wo passend, am SRD 5.2.1 (CC-BY-4.0).

## Lizenz

Code und Build unter [MIT](LICENSE). Der Abenteuertext ist für den privaten
Spieltisch gedacht.

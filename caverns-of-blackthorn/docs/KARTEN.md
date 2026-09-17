# Karten — Blackthorn

Neun neu gezeichnete Einzelkarten plus Gesamtübersicht. Liegen beim DM als
`Blackthorn-Neufassung-Komplett.zip`, **noch nicht im Repo**.

Die Karten enthalten **kein eingebranntes Raster**, keine Bewohner-Tokens, keine
Wände und keine Lichtdaten. Alles wird in Foundry gesetzt.

---

## Rasterwerte

**Festgelegt vom DM. 1 Rasterfeld = 5 ft ≈ 1,5 m.**

| Karte | Datei | Bild (px) | Felder | Weltmaß | px/Feld |
|---|---|---|---|---|---|
| 01 Versteckter Eingang | `01_Versteckter_Eingang_Neufassung.png` | 1422 × 1106 | 90 × 70 | 450 × 350 ft | 15,8 |
| 02 Obere Pilzhöhle | `02_Obere_Pilzhoehle_Neufassung.png` | 1426 × 1103 | 44 × 34 | 220 × 170 ft | 32,4 |
| 03+06 Fontäne & Grabung | `03-06_Fontaene_und_Grabung_Neufassung.png` | 1235 × 1274 | 64 × 66 | 320 × 330 ft | 19,3 |
| 04 Gnollhöhle | `04_Gnollhoehle_Neufassung.png` | 1367 × 1151 | 38 × 32 | 190 × 160 ft | 36,0 |
| 05 Garghuks Halle | `05_Garghuks_Halle_Neufassung.png` | 1387 × 1134 | 44 × 36 | 220 × 180 ft | 31,5 |
| 07 Orksiedlung | `07_Orksiedlung_Neufassung.png` | 1512 × 1040 | 64 × 44 | 320 × 220 ft | 23,6 |
| 08 Duergar-Umschlagplatz | `08_Duergar_Umschlagplatz_Neufassung.png` | 1466 × 1073 | 52 × 38 | 260 × 190 ft | 28,2 |
| 09 Unterer Canyon | `09_Unterer_Canyon_Neufassung.png` | 1499 × 1049 | 60 × 42 | 300 × 210 ft | 25,0 |
| 10 Waldstraße | `10_Waldstrasse_Neufassung.png` | 1536 × 1024 | 84 × 56 | 420 × 280 ft | 18,3 |

**Entschieden:** Maße bleiben so. Unschärfe ist kein Problem — „fördert Fantasie".
Falls sich die niedrige Pixeldichte am Tisch als Problem zeigt (Tokens bei
15,8 px/Feld sind winzig), wird gemeinsam nachskaliert. Zum Vergleich: Für 60 px
pro Feld bräuchte Karte 01 den Faktor 3,8× (→ 22 Megapixel), Karte 02 nur 1,9×.

---

## Zuordnung Karte ↔ Journalseite

Die Journalseiten in `src/journal/blackthorn.yml` sind nach der Vorlage nummeriert
(`bereich-1` … `bereich-7`), die Karten nach der Neufassung (01 … 10).
**Muss angeglichen werden**, sonst zeigt jeder Szenen-Pin auf die falsche Seite.

| Karte | Journalseite | Tiefe |
|---|---|---|
| 01 Versteckter Eingang | *neu* | Oberfläche |
| 02 Obere Pilzhöhle | `bereich-1` | 250 ft |
| 03 Fontäne | `bereich-2` | 500 ft |
| 04 Gnollhöhle | `bereich-3` | — |
| 05 Garghuks Halle | `bereich-4` | ~300 ft |
| 06 Grabung | `bereich-5` | 1.000 ft |
| 07 Orksiedlung | `bereich-6` | — |
| 08 Duergar-Umschlagplatz | *neu* | tiefer, östlich |
| 09 Unterer Canyon | `bereich-7` | > 1.000 ft tiefer |
| 10 Waldstraße | *neu* | Oberfläche |

---

## Technische Entscheidungen

### 03+06 — eine Szene, Terrainwände
**Entschieden: eine Szene, nicht zwei.** Man soll von der Klippe hinunterschauen
können, und wer fällt, fällt.

Umsetzung in Foundry: Wandsegmente entlang **beider** Kanten des schwarzen Spalts
mit

```
move:  20   (CONST.WALL_MOVEMENT_TYPES.NORMAL — blockiert Bewegung)
sight:  0   (CONST.WALL_SENSE_TYPES.NONE     — blockiert Sicht NICHT)
light:  0
sound:  0
```

Zwei Durchlässe frei lassen:
- die **Treppe rechts** (im Bild bei etwa x 880, y 490–620)
- die **Klippe am Wasserfall** links — Aufstieg SG 10 Athletik, im nassen Rinnsal
  SG 17, Fehlschlag bedeutet 500 Fuß

Rund zehn Wandsegmente.

### 07 — Bugbear-Bezirk
**Entschieden:** Gwendolyns Restsippe lebt in einem **abgetrennten Bezirk der
Orksiedlung**, nicht als Außenposten an der Oberfläche.

Begründung: Der Eingang soll unauffällig bleiben — ein bewachter Außenposten wäre
sichtbar. Und Gwendolyn muss mit in den Bau, damit sie Teil der Verhandlung werden
oder zu ihrem Volk überlaufen kann.

**Enge ist erwünscht.** Falls es zu eng wird: Karte wird größer neu gezeichnet, oder
es werden zwei bis drei Höhlen.

### Alle Szenen
- Raster 5 ft, Pixelwerte aus der Tabelle oben
- Kein eingebranntes Raster → `grid.alpha` nach Geschmack, Karten bringen keins mit
- Dunkelheit 1.0 für alle Untertage-Szenen
- Tokens `hidden: true` beim Import
- Lichtquellen: Fontäne als grelle Quelle (bright 90 / dim 220, `#fff6d8`),
  Kochfeuer und Fackeln in 05 und 07, Tageslicht durch den Schacht in 02

---

## Was auf den Karten steht

Nur die spielrelevanten Details, die beim Bauen gebraucht werden.

**01 Versteckter Eingang** — Zwei dunkle Öffnungen im Dornendickicht oben rechts
(Schacht und Tunnelmündung). Wildwechsel, helle Weideflächen, weiße Hornmarken am
Rand. Erkundung, kein Kampfplatz.

**02 Obere Pilzhöhle** — Vier erhöhte, steingefasste Pilzbeete als Deckung, offene
Mitte, **Leiter im Lichtkegel des Deckenschachts**. Zwei Treppenausgänge: oben
rechts zur Oberfläche, unten links hinab. Werkzeug, Kisten, Fässer.
*Der Wachposten.*

**03+06 Fontäne & Grabung** — Obere Hälfte: leuchtende Fontäne, Kürbisbeete links,
**Trennmauer** senkrecht, abgeschatteter Ostteil dahinter. Untere Hälfte:
Wasserfall in ein Becken, Bach nach Südwesten, **Steinbrücke**, Steinbruch rechts mit
geschnittenen Blöcken, Kran, Schutthalden. Dazwischen der schwarze Spalt, 500 ft.

**04 Gnollhöhle** — Fünf bis sechs Nestgruppen aus Stroh und Fellen, zentrale
Feuerstelle mit Kessel und Knochenhaufen, Brandfleck, ein Ausgang nach Osten.
Familienlager mit Jungtieren — moralisch, nicht taktisch.

**05 Garghuks Halle** — Thron auf erhöhtem Podest mit zwei stehenden Stoßzähnen und
Banner; **Targs Schrein** oben rechts mit Waffen und Opferschalen; Vorräte oben
links; zwei Kochfeuer; sechs große Anführer-Lager an der Südwand;
**Leiter nach unten in der Südwestecke** (Garghuks Fluchtweg); Ausgangskorridor
rechts mit Waffenständern. *Die Bossarena.*

**07 Orksiedlung** — Elf Gehöfte mit Lagern, Truhen, Waffenständern; zwei Feuerplätze;
Werkbank; **großer Pferch mit Stroh** (Rothé); Wandfackeln; drei Ausgänge.
Eine Verfolgungsjagd durch die Gassen trägt eine Sitzung. Hier kommt der
Bugbear-Bezirk hinein.

**08 Duergar-Umschlagplatz** — Kreuzungskammer mit fünf Tunnelmündungen. Oben rechts
Waren: Kisten, gebündelte Stangen, Fässer. Rechts ein Schreibtisch.
**Unten Eisenringe im Boden und niedrige Bänke** — der Sklavenumschlag, sichtbar
ohne ein Wort Erklärung.

**09 Unterer Canyon** — Lokaler Flussabschnitt mit Stromschnellen, Felsterrassen.
Ausdrücklich nur ein Ausschnitt; der Abstieg dazwischen bleibt schematisch.

**10 Waldstraße** — Straßengabelung mit breiter Verge, Felsrücken rechts
(Schützenstellung), Bach links unten. Karawanen-Hinterhalt.

---

## Anschlüsse und Höhen

Aus der Gesamtübersicht des DM:

- 03 → 06: **500 Fuß** Höhenunterschied. Die Fontäne entwässert in die Grabung.
- Der Canyonfluss liegt nochmals **über 1.000 Fuß** unter dem oberen Klippenpfad.
- 08 Ost: zur Duergar-Siedlung. 08 Süd: weiter in die Unterwelt.
- Norden ist auf allen Karten oben.
- 01 → 02 über den versteckten Zugang bzw. den Schacht.
- 02 → 03 über einen langen Treppenabstieg.
- 05 hat einen oberen Klippenpfad mit langem Abstieg Richtung 09.

---

## Das Banner

Vom DM neu gezeichnet: schwarzer Dorn auf ungebleichtem Leinen, roter Schrägstrich
wie ein Klauenhieb, roter Schädel darunter, an einem Speerschaft mit Querholz,
unterer Rand ausgefranst.

Ersetzt die prozedural gerenderte Fassung aus `build/make-banner.py`.

**Bedeutung:** Der Dorn stand schon vor dem Clan für den Ort. Der Schrägstrich kam
mit Garghuk dazu — es ist der Hieb, mit dem eine Kette durchtrennt wird.

# Karten und Szenen — Blackthorn

Zehn handgezeichnete Karten: neun Schauplätze plus Gesamtübersicht. Sie liegen beim
DM als `Blackthorn-Neufassung-Komplett.zip` und kommen beim Umbau nach
`assets/maps/`.

Die Karten enthalten **kein eingebranntes Raster**, keine Tokens, keine Wände und
keine Lichtdaten. Alles wird in Foundry gesetzt.

---

## 1 · Ein Schlüssel für alles

Szenen, Journalseiten, Pins und Tokens tragen dieselbe Nummer wie die Karte.

```
Karte 05  →  Szene  ort-05-halle
          →  Seite  ort-05-halle      (flags.caverns-of-blackthorn.area = 5)
          →  Pins   note:ort-05-halle:thron, :schrein, :vorrat, :leiter
```

| Nr. | Datei (Stamm) | Szene / Seite | Tiefe |
|---|---|---|---|
| 01 | `01_Versteckter_Eingang` | `ort-01-eingang` | Oberfläche |
| 02 | `02_Obere_Pilzhoehle` | `ort-02-pilzhoehle` | 250 ft |
| 03 | `03-06_Fontaene_und_Grabung` | `ort-03-fontaene` | 500 ft |
| 04 | `04_Gnollhoehle` | `ort-04-gnollhoehle` | — |
| 05 | `05_Garghuks_Halle` | `ort-05-halle` | ~300 ft |
| 06 | *(dieselbe Bilddatei wie 03)* | `ort-06-grabung` | 1.000 ft |
| 07 | `07_Orksiedlung` | `ort-07-siedlung` | — |
| 08 | `08_Duergar_Umschlagplatz` | `ort-08-umschlagplatz` | tiefer, östlich |
| 09 | `09_Unterer_Canyon` | `ort-09-canyon` | > 1.000 ft tiefer |
| 10 | `10_Waldstrasse` | `ort-10-waldstrasse` | Oberfläche |

**03 und 06 teilen sich eine Szene** (`ort-03-fontaene`), tragen aber zwei
Journalseiten und zwei Pin-Gruppen — die Klippe trennt sie, nicht die Datei.

Die Szenen bekommen `sort` in dieser Reihenfolge, damit die Szenenliste in Foundry
in Spielreihenfolge steht.

---

## 2 · Rasterwerte

**Festgelegt vom DM. 1 Rasterfeld = 5 ft ≈ 1,5 m.**

| Nr. | Bild (px) | Felder | Weltmaß | px/Feld |
|---|---|---|---|---|
| 01 | 1422 × 1106 | 90 × 70 | 450 × 350 ft | 15,8 |
| 02 | 1426 × 1103 | 44 × 34 | 220 × 170 ft | 32,4 |
| 03+06 | 1235 × 1274 | 64 × 66 | 320 × 330 ft | 19,3 |
| 04 | 1367 × 1151 | 38 × 32 | 190 × 160 ft | 36,0 |
| 05 | 1387 × 1134 | 44 × 36 | 220 × 180 ft | 31,5 |
| 07 | 1512 × 1040 | 64 × 44 | 320 × 220 ft | 23,6 |
| 08 | 1466 × 1073 | 52 × 38 | 260 × 190 ft | 28,2 |
| 09 | 1499 × 1049 | 60 × 42 | 300 × 210 ft | 25,0 |
| 10 | 1536 × 1024 | 84 × 56 | 420 × 280 ft | 18,3 |

Maße bleiben so. Unschärfe ist kein Problem — „fördert Fantasie". Falls sich die
niedrige Pixeldichte am Tisch als Problem zeigt (Tokens bei 15,8 px/Feld sind
winzig), wird nachskaliert; für 60 px pro Feld bräuchte Karte 01 den Faktor 3,8×
(→ 22 Megapixel), Karte 02 nur 1,9×.

**Achtung beim Generator:** `src/scene/*.yml` rechnet in **10-Fuß-Zellen**,
`scene.mjs` halbiert auf das 5-Fuß-Raster. `cellPixels` ist also der **doppelte**
Wert aus der Spalte px/Feld, und `widthCells`/`heightCells` die **halbe**
Feldzahl. Karte 05: `cellPixels: 63`, `widthCells: 22`, `heightCells: 18`.

---

## 3 · Die wesentlichen Pins

Pro Szene wenige Pins, die etwas auslösen — nicht jede Kiste. Jeder Pin öffnet die
Journalseite der Szene; das Label sagt, worum es geht.

### `ort-01-eingang`
| Pin | Was |
|---|---|
| **Tunnelmündung** | Der Weg, den die Beute nimmt. Bewacht. |
| **Schacht im Dickicht** | 250 Fuß Leiter, unbewacht. Rhogars Richtung. |
| **Hornposten** | Erstes Glied der Hornkette. Wer ihn ausschaltet, kauft eine Alarmstufe. |
| **Weideflächen und Wildwechsel** | Die Spuren, die verraten, dass hier jemand Vieh hält. |

### `ort-02-pilzhoehle`
| Pin | Was |
|---|---|
| **Der Wachposten** | Der erste Kampf. Besetzung und Budget auf der Seite. |
| **Leiter im Lichtkegel** | Aufgang zur Oberfläche, taghell und damit unangenehm. |
| **Pilzbeete** | Vier steingefasste Beete, halbe Deckung. |
| **Treppe hinab** | Langer Abstieg zur Fontänenhöhle. |

### `ort-03-fontaene` (obere Hälfte der Karte)
| Pin | Was |
|---|---|
| **Die Fontäne** | Heilung, Lichtquelle, bester Kampfplatz des Baus. Regeln auf der Seite. |
| **Trennmauer** | Warum die Bewohner den Raum nicht meiden müssen. Ostteil abgeschattet. |
| **Kürbisbeete** | Der Beweis, dass hier jemand anbaut statt nur nimmt. |
| **Klippenkante** | Absturz 500 Fuß. Man darf hinuntersehen. |

### `ort-06-grabung` (untere Hälfte derselben Szene)
| Pin | Was |
|---|---|
| **Wasserfall und Becken** | Aufstieg SG 10 Athletik, im nassen Rinnsal SG 17. |
| **Steinbruch mit Kran** | Frisch gebrochene Blöcke — Rhogars Gestein. |
| **Steinbrücke** | Der einzige bequeme Übergang. |
| **Der Strafposten** | Wer hier arbeitet, wurde hierher geschickt. |

### `ort-04-gnollhoehle`
| Pin | Was |
|---|---|
| **Nestgruppen** | Fünf bis sechs Lager aus Stroh und Fellen, mit Jungtieren. |
| **Feuerstelle** | Kessel, Knochenhaufen, Brandfleck. Was die Gnolle vom Sold halten. |
| **Ostausgang** | Einziger Weg hinaus. Ein Rückzug hier ist eine Verfolgung. |

### `ort-05-halle`
| Pin | Was |
|---|---|
| **Der Thron** | Garghuk. Podest, zwei Stoßzähne, Banner. |
| **Targs Schrein** | Waffen, Opferschalen. Wer hier etwas anfasst, hat Targ am Hals. |
| **Vorräte** | **Das Saatgetreide liegt hier.** Der Beweis für Garghuks Plan. |
| **Leiter in der Südwestecke** | Sein Fluchtweg. Wer sie kennt, kann ihn stellen. |
| **Waffenständer im Korridor** | Was die Wache greift, wenn Alarm gegeben wird. |

### `ort-07-siedlung`
| Pin | Was |
|---|---|
| **Bugbear-Bezirk** | Gwendolyns Restsippe. Abgetrennt, eng, bewacht. |
| **Rothé-Pferch** | Die Herde. Blackthorn produziert im Kleinen schon selbst. |
| **Drillplatz** | Hurrek und seine Formationen. |
| **Werkbank und Feuerplätze** | Wo tagsüber jemand steht. |
| **Drei Ausgänge** | Eine Verfolgungsjagd durch die Gassen trägt eine Sitzung. |

### `ort-08-umschlagplatz`
| Pin | Was |
|---|---|
| **Eisenringe im Boden** | Die Kolonne. Erklärt sich ohne ein Wort. |
| **Der Schreibtisch** | Lieferlisten. Gildruns Buch, wenn er da ist. |
| **Warenstapel** | Kisten, Stangen, Fässer — **Grauzwergenstahl mit Punze**. |
| **Osttunnel** | Zur Duergar-Siedlung. |
| **Südtunnel** | Weiter hinab. Der Sklavenweg. |

### `ort-09-canyon`
| Pin | Was |
|---|---|
| **Stromschnellen** | Wer hier hineinfällt, ist weg. |
| **Felsterrassen** | Die einzigen Standflächen. |
| **Abraumhalde** | Zehn Jahre Grabung. Warum an der Oberfläche nichts zu sehen ist. |

### `ort-10-waldstrasse`
| Pin | Was |
|---|---|
| **Die Gabelung** | Wo der Hinterhalt liegt. |
| **Felsrücken** | Schützenstellung, erhöht. |
| **Bach** | Deckung und Fluchtweg nach Südwesten. |

**Kleine Generator-Erweiterung dafür:** `scene.mjs` vergibt Notiz-IDs derzeit als
`note:<szene>:<area>` — ein Pin pro Bereich. Für mehrere Pins je Szene bekommt ein
Notiz-Eintrag ein eigenes `key`-Feld, und die ID wird `note:<szene>:<key ?? area>`.
Das `page`-Feld bleibt optional und fällt auf die `area`-Seite zurück.

---

## 4 · Technische Entscheidungen

### 03+06 — eine Szene, Terrainwände
Man soll von der Klippe hinunterschauen können, und wer fällt, fällt.

Wandsegmente entlang **beider** Kanten des schwarzen Spalts:

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

Rund zehn Wandsegmente. `scene.mjs` nimmt `walls` bereits entgegen.

### 07 — Bugbear-Bezirk
Gwendolyns Restsippe lebt in einem **abgetrennten Bezirk der Orksiedlung**. Der
Eingang zum Bau soll unauffällig bleiben, und Gwendolyn muss mit hinein, damit sie
Teil der Verhandlung werden oder zu ihrem Volk übergehen kann.

**Enge ist erwünscht.** Falls es zu eng wird: Karte größer neu zeichnen, oder es
werden zwei bis drei Höhlen.

### Alle Szenen
- Raster 5 ft, Pixelwerte aus Abschnitt 2
- Kein eingebranntes Raster → `gridAlpha` nach Geschmack
- Dunkelheit 1.0 für alle Untertage-Szenen, 0.0 für 01 und 10
- Tokens `hidden: true`, Größen aus der Kreatur
- Lichtquellen: Fontäne grell (bright 90 / dim 220, `#fff6d8`, Puls), Kochfeuer und
  Fackeln in 05 und 07 (`torch`), Tageslicht durch den Schacht in 02 (bright 0 /
  dim 30, kalt), Restlicht am Wasserfall in 06

---

## 5 · Was auf den Karten steht

**01 Versteckter Eingang** — Zwei dunkle Öffnungen im Dornendickicht oben rechts
(Schacht und Tunnelmündung). Wildwechsel, helle Weideflächen, weiße Hornmarken am
Rand. Erkundung, kein Kampfplatz.

**02 Obere Pilzhöhle** — Vier erhöhte, steingefasste Pilzbeete als Deckung, offene
Mitte, Leiter im Lichtkegel des Deckenschachts. Zwei Treppenausgänge: oben rechts
zur Oberfläche, unten links hinab. Werkzeug, Kisten, Fässer.

**03+06 Fontäne & Grabung** — Obere Hälfte: leuchtende Fontäne, Kürbisbeete links,
Trennmauer senkrecht, abgeschatteter Ostteil dahinter. Untere Hälfte: Wasserfall in
ein Becken, Bach nach Südwesten, Steinbrücke, Steinbruch rechts mit geschnittenen
Blöcken, Kran, Schutthalden. Dazwischen der schwarze Spalt, 500 Fuß.

**04 Gnollhöhle** — Fünf bis sechs Nestgruppen aus Stroh und Fellen, zentrale
Feuerstelle mit Kessel und Knochenhaufen, Brandfleck, ein Ausgang nach Osten.
Familienlager mit Jungtieren — moralisch, nicht taktisch.

**05 Garghuks Halle** — Thron auf erhöhtem Podest mit zwei stehenden Stoßzähnen und
Banner; Targs Schrein oben rechts mit Waffen und Opferschalen; Vorräte oben links;
zwei Kochfeuer; sechs große Anführer-Lager an der Südwand; Leiter nach unten in der
Südwestecke; Ausgangskorridor rechts mit Waffenständern.

**07 Orksiedlung** — Elf Gehöfte mit Lagern, Truhen, Waffenständern; zwei
Feuerplätze; Werkbank; großer Pferch mit Stroh (Rothé); Wandfackeln; drei Ausgänge.

**08 Duergar-Umschlagplatz** — Kreuzungskammer mit fünf Tunnelmündungen. Oben rechts
Waren: Kisten, gebündelte Stangen, Fässer. Rechts ein Schreibtisch. Unten Eisenringe
im Boden und niedrige Bänke.

**09 Unterer Canyon** — Lokaler Flussabschnitt mit Stromschnellen, Felsterrassen.
Ausdrücklich nur ein Ausschnitt; der Abstieg dazwischen bleibt schematisch.

**10 Waldstraße** — Straßengabelung mit breiter Verge, Felsrücken rechts
(Schützenstellung), Bach links unten. Karawanen-Hinterhalt.

---

## 6 · Anschlüsse und Höhen

Aus der Gesamtübersicht des DM:

- 01 → 02 über den versteckten Zugang bzw. den Schacht (250 ft).
- 02 → 03 über einen langen Treppenabstieg.
- 03 → 06: **500 Fuß** Höhenunterschied. Die Fontäne entwässert in die Grabung.
- 05 hat einen oberen Klippenpfad mit langem Abstieg Richtung 09.
- Der Canyonfluss liegt nochmals **über 1.000 Fuß** unter dem oberen Klippenpfad.
- 08 Ost: zur Duergar-Siedlung. 08 Süd: weiter in die Unterwelt.
- Norden ist auf allen Karten oben.

---

## 7 · Das Banner

Vom DM gezeichnet: schwarzer Dorn auf ungebleichtem Leinen, roter Schrägstrich wie
ein Klauenhieb, roter Schädel darunter, an einem Speerschaft mit Querholz, unterer
Rand ausgefranst. Es ersetzt die prozedurale Fassung aus `build/make-banner.py`.

**Bedeutung:** Der Dorn stand schon vor dem Clan für den Ort. Der Schrägstrich kam
mit Garghuk dazu — es ist der Hieb, mit dem eine Kette durchtrennt wird.

# Handoff — Blackthorn

**Auftrag:** Das Abenteuer „Die Höhlen von Blackthorn" als Foundry-Modul für die
Greyhawk-Kampagne der *Falken des Selintan* fertigstellen. Markus ist DM, die
Gruppe spielt es im Winter 576/577 CY auf Stufe 7.

Dieses Verzeichnis ist der Einstieg. Es enthält **Entscheidungen und Daten**, keine
Arbeitsschritte — die stehen unten unter „Baustellen".

| Datei | Inhalt |
|---|---|
| [`LORE.md`](LORE.md) | Völker, Chronologie, Verträge und Zwiste |
| [`NPCS.md`](NPCS.md) | Personen: Werte, Ziele, Persönlichkeit, Verhandlung |
| [`HOOKS.md`](HOOKS.md) | Einstieg, Aufhänger, Uhren, erreichbare Ziele |
| [`KARTEN.md`](KARTEN.md) | Die zehn Karten, Rasterwerte, technische Entscheidungen |

---

## Wo was liegt

**Im Repo** (`caverns-of-blackthorn/`):

| Pfad | Was |
|---|---|
| `src/creatures/*.yml` | 19 Statblocks, kompaktes Eigenformat |
| `src/journal/blackthorn.yml` | Abenteuertext, 10 Seiten |
| `src/journal/lore.yml` | Lore und Aufhänger, 4 Seiten |
| `src/items/hort.yml` | 7 Gegenstände |
| `src/scene/blackthorn.yml` | Szenendefinition (Platzhalterkarte) |
| `build/` | Generator, Verifier, Kartenrenderer |
| `CLAUDE.md` | Architektur und Fallstricke des Pack-Formats — **vor Codearbeit lesen** |

**Außerhalb des Repos** (liegt beim DM):

- `Blackthorn-Neufassung-Komplett.zip` — neun Einzelkarten, Gesamtübersicht, `Kartenverzeichnis.json`
- `DM-Briefing_Stand_JK42.md` — Kampagnenstand, Charaktere, Fraktionen, offene Fäden
- Charakter-Hintergründe (Gaglath, Rhogar, Faylith, Uhtred)
- Das neu gezeichnete Clan-Banner

---

## Gruppe und Budgets

- **Spielercharaktere im Bau:** Uhtred, Gaglath, Rhogar. Alle **Stufe 7** zu Beginn.
- **Faylith bleibt oben.** Höchstens lenkende Rolle, nicht im Dungeon. Markus spielt sie nicht mit.
- **Sidekicks** füllen auf **4–5 Spieler-Äquivalente** auf. Sie sind schwächer als ein SC — Absorptionsmasse und Aktionsökonomie, kein Schadensausgleich.
- Es darf **anstrengend** werden.

Begegnungsbudgets (DMG 2024, Stufe 7 = 750/1.300/1.700 pro Charakter):

| Äquivalente | Niedrig | Mittel | Hoch |
|---|---|---|---|
| 4 | 3.000 | 5.200 | 6.800 |
| 5 | 3.750 | 6.500 | 8.500 |

**Zwei bis drei lange Rasten** sind eingeplant — Gildrun kommt erst in ein paar Tagen.

---

## Baustellen

### 1 · Lore
**Stand:** Festgelegt, siehe `LORE.md`.
**Nächstes:** `src/journal/lore.yml` und `src/journal/blackthorn.yml` auf diesen
Stand bringen.

### 2 · Karten
**Stand:** Zehn Karten liegen vor, Rasterwerte festgelegt, siehe `KARTEN.md`.
**Nächstes:** Karten nach `assets/maps/` kopieren, zehn Szenen bauen, Terrainwände
am Spalt von 03+06, Bugbear-Bezirk auf 07 markieren.

### 3 · Modul
**Stand:** Build-Pipeline läuft, `node build/verify.mjs` grün. 19 Kreaturen,
7 Gegenstände, 2 Journals, 1 Platzhalterszene.
**Nächstes:** siehe „Was im Repo noch nicht dem Stand entspricht".

### 4 · Statblocks
**Stand:** 19 gebaut. **Gildrun fehlt** — Entwurf mit Werten steht in `NPCS.md`.
**Nächstes:** Gildrun anlegen, Kreaturentypen korrigieren, Wachposten verstärken.

---

## Was im Repo noch nicht dem Stand entspricht

Konkrete Arbeitspunkte, geprüft am 17.09.2026:

1. **Kreaturentypen der Goblinoiden.**
   `src/creatures/blackthorn-clan.yml`: `bugbear-schleicher` und
   `hobgoblin-drillmeister` stehen als `humanoid/goblinoid`.
   Im SRD 5.2.1 sind beide **`fey`, Subtyp `Goblinoid`** (verifiziert gegen
   `actors24/`). Muss umgestellt werden — betrifft auch Zauber, die auf Humanoide
   zielen.

2. **Kommentar in `src/creatures/blackthorn-clan.yml:194`**
   („angeworben, nicht erobert") widerspricht der festgelegten Lore. Ersetzen.

3. **Bereichsnummerierung.** Die Journalseiten heißen `bereich-1` … `bereich-7`,
   die Karten `01` … `10`. Zuordnungstabelle in `KARTEN.md`. Muss angeglichen
   werden, sonst zeigt jeder Szenen-Pin auf die falsche Seite.

4. **Wachposten zu weich.** Die Begegnung in `src/journal/blackthorn.yml`,
   Seite `bereich-1`, liegt bei 2.500 XP. Ein Hobgoblin-Drillmeister dazu
   (+700 XP → 3.200) hebt sie auf ein angemessenes Niveau für den ersten Kampf.

5. **Platzhalterkarte.** `build/make-map.py` und `assets/maps/blackthorn.webp`
   werden durch die zehn echten Karten ersetzt.

6. **`party: { level: 7, size: 4 }`** in beiden Journalquellen prüfen — die
   Skalierungstabelle sollte zusätzlich eine Spalte für 5 Äquivalente bekommen.

---

## Wo es noch knirscht

### Thalertas Heilung
Im DM-Briefing steht **nichts** über eine Heilung von Thalerta/Fanaticca durch einen
Priester. Falls das am Tisch passiert ist, ist es ein Präzedenzfall, der Rhogars
Motiv aushebelt: Wenn ein erreichbarer Priester so etwas kann, fährt er nicht nach
Blackthorn. **[ungeprüft — nur der DM weiß es.]**

**Vorschlag zur Abgrenzung:** Zauber stellen wieder her, was *verloren* ging.
Die Fontäne stellt wieder her, was *falsch verheilt* ist. Keshras Bein fehlt nicht;
es ist ein Jahrzehnt schlecht zusammengewachsener Knochen und toter Nerv. Die
Vorlage nennt für die Fontäne ausdrücklich *Läsionen und Körperverfall* — genau die
Lücke, die Zauber offen lassen.

### Rothé als Handelsgut
**Ausgeschlossen:** Export als Zuchtvieh in die Fordlande. Rothé sind unterirdische
Tiere, und niemand dort wird anfangen, Höhlenrinder zu halten.

**Vorschlag:** Die Herde ist **Beweisstück**, kein Handelsgut — Blackthorn kann
produzieren statt nehmen, es tut es schon im Kleinen. Das eigentliche Handelsgut ist
die **Waldkenntnis der Hobgoblins**. Underearth-Handel mit Rothéfleisch bleibt als
späterer Faden liegen; er hängt an den Duergar, und die will man nicht zu
Handelspartnern machen, solange die Ringe im Boden liegen.

### Warum die Gruppe im Dickicht bleibt
**Ausgeschlossen:** Dickicht als Labyrinth, aus dem man nicht herausfindet, und
„Rhogars Leitkünste versagen". Das ist eine Wand, und der Spieler wird sie als Wand
erkennen — es bestraft seine Kernfähigkeit.

**Vorschlag:** Drei gleichzeitig laufende Uhren, Details in `HOOKS.md`. Wer
hinausgeht und mit einer Streitmacht wiederkommt, verliert konkret etwas.
Rhogars Sog bleibt — als Sog, nicht als Mauer. Er *kann* gehen.

### Bugbear-Unterkunft
**Entschieden:** abgetrennter Bezirk in der Orksiedlung (Karte 07), nicht als
Außenposten an der Oberfläche — der Eingang soll unauffällig bleiben, und Gwendolyn
soll mit in den Bau müssen.

**Offen:** ob die Karte dafür größer neu gezeichnet wird oder ob es zwei bis drei
Höhlen werden. Enge ist ausdrücklich erwünscht.

### Der Sklavenstrang
**Nicht entschieden, beide Enden werden gebaut:**
- *Abgeschlossen:* Gildrun stellt sich, die Kolonne wird befreit, die Abnehmerliste
  landet beim Witan.
- *Offen:* Gildrun entkommt, die Liste führt über die lila Marke nach Highport
  weiter — Anschluss für das nächste Abenteuer und womöglich den nächsten DM.

### Kartenauflösung
**Entschieden:** Maße bleiben wie geliefert, Unschärfe ist kein Problem.
Bei 15,8–36 px pro Feld sind Tokens klein; falls sich das am Tisch als Problem
zeigt, wird gemeinsam nachskaliert. Zahlen in `KARTEN.md`.

### Uhtred als SC oder DM-NPC
Das Briefing führt ihn für JK41/42 als DM-geführten NPC. Für Blackthorn ist er als
Spielercharakter eingeplant. **[ungeprüft, ob sein Spieler dabei ist.]** Fällt er
aus, sinken alle Budgets um rund ein Viertel.

---

## Empfohlenes Vorgehen für Folge-Sessions

- **Lore-Session:** `LORE.md` + `NPCS.md` lesen, dann `src/journal/*.yml` neu fassen.
- **Karten-Session:** `KARTEN.md` + `CLAUDE.md` (Abschnitt Szenen) lesen.
  Karten liegen beim DM und müssen eingespielt werden.
- **Modul-Session:** `CLAUDE.md` vollständig lesen — besonders den `_key`-Fallstrick,
  der einen leeren Pack mit Exit-Code 0 erzeugt. Nach jeder Änderung
  `node build/build.mjs && node build/verify.mjs`.
- **Statblock-Session:** `NPCS.md` für Gildrun, `src/creatures/` als Muster.

Branch: `claude/caverns-blackthorn-foundry-5nz9j0`.

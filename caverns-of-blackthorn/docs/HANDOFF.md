# Handoff — Blackthorn

**Auftrag:** Das Abenteuer „Die Höhlen von Blackthorn" als Foundry-Modul für die
Greyhawk-Kampagne der *Falken des Selintan* fertigstellen. Markus ist DM, die Gruppe
spielt es im tiefen Winter auf Stufe 7.

Dieses Verzeichnis ist der Einstieg. Es enthält **Entscheidungen und Daten**; wie sie
ins Modul kommen, steht in `UMBAU-REGELN.md`.

| Datei | Inhalt |
|---|---|
| [`LORE.md`](LORE.md) | Völker, wie sie lebten und warum sie heute dort sind; Verträge und Zwiste |
| [`NPCS.md`](NPCS.md) | Personen: Ziele, Persönlichkeit, Reaktionen, Werte |
| [`HOOKS.md`](HOOKS.md) | Einstiege, Uhren, erreichbare Ziele, Alarmstufen |
| [`KARTEN.md`](KARTEN.md) | Die zehn Karten als Szenen, Rasterwerte, Pins |
| [`UMBAU-REGELN.md`](UMBAU-REGELN.md) | Wie gebaut wird — **vor Arbeit an `src/` lesen** |

Technische Fallstricke des Pack-Formats: [`../CLAUDE.md`](../CLAUDE.md).

---

## Wo was liegt

**Im Repo** (`caverns-of-blackthorn/`):

| Pfad | Was |
|---|---|
| `src/creatures/*.yml` | 19 Statblocks, kompaktes Eigenformat |
| `src/journal/blackthorn.yml` | Abenteuertext |
| `src/journal/lore.yml` | Lore und Aufhänger |
| `src/items/hort.yml` | 7 Gegenstände |
| `src/scene/blackthorn.yml` | Szenendefinition (Platzhalterkarte) |
| `build/` | Generator, Verifier, Assetrenderer |
| `CLAUDE.md` | Architektur und Fallstricke des Pack-Formats |

**Beim DM** (kommt in die jeweilige Session mit):

- `Blackthorn-Neufassung-Komplett.zip` — neun Einzelkarten, Gesamtübersicht, `Kartenverzeichnis.json`
- `DM-Briefing` — Kampagnenstand, Charaktere, Fraktionen, offene Fäden
- Charakter-Hintergründe (Gaglath, Rhogar, Faylith, Uhtred)
- Das gezeichnete Clan-Banner

---

## Gruppe und Budgets

- **Spielercharaktere:** Uhtred, Gaglath, Rhogar. Alle **Stufe 7** zu Beginn.
- **Faylith ist die Spielleitung** für dieses Abenteuer.
- **Sidekicks** füllen auf **4–5 Spieler-Äquivalente** auf. Sie sind schwächer als ein
  SC — Absorptionsmasse und Aktionsökonomie, kein Schadensausgleich.
- Es darf **anstrengend** werden.

Begegnungsbudgets (DMG 2024, Stufe 7 = 750/1.300/1.700 pro Charakter):

| Äquivalente | Niedrig | Mittel | Hoch |
|---|---|---|---|
| 4 | 3.000 | 5.200 | 6.800 |
| 5 | 3.750 | 6.500 | 8.500 |

**Zwei bis drei lange Rasten** sind eingeplant — Gildrun kommt erst in ein paar Tagen.

---

## Baustellen

Jede ist für sich bearbeitbar. Alle lesen zuerst `UMBAU-REGELN.md`.

### 1 · Lore
**Steht.** `LORE.md` ist Kanon.
**Zu tun:** `src/journal/lore.yml` und `src/journal/blackthorn.yml` auf diesen Stand
bringen, Ortsseiten auf die sechsteilige Gliederung (Regel C12).

### 2 · Karten
**Steht.** Zehn Karten, Rasterwerte und Pinlisten in `KARTEN.md`.
**Zu tun:** Karten nach `assets/maps/`, zehn Szenen bauen, Terrainwände am Spalt,
Bugbear-Bezirk auf 07, Pins setzen. Braucht das ZIP vom DM.

### 3 · Modul
**Steht.** Build-Pipeline läuft, `node build/verify.mjs` grün. 19 Kreaturen,
7 Gegenstände, 2 Journals, 1 Platzhalterszene.
**Zu tun:** Schlüsselschema `ort-<nr>-…`, mehrere Pins je Szene, Platzhalterkarte
entfernen. Liste in `UMBAU-REGELN.md` am Ende.

### 4 · Statblocks
**Steht.** 19 gebaut, Bestandstabelle in `NPCS.md`.
**Zu tun:** Gildrun anlegen (Werte stehen da), Goblinoide auf `fey` umstellen,
Wachposten am Einstieg verstärken.

---

## Offene Entscheidungen

Zwei, beide betreffen Karten und können am Tisch fallen.

### Der Bugbear-Bezirk auf Karte 07
Er kommt in die Orksiedlung, abgetrennt und eng — das steht. Offen ist nur, ob die
Karte dafür größer neu gezeichnet wird oder ob daraus zwei bis drei kleinere Höhlen
werden. Enge ist ausdrücklich erwünscht; die Entscheidung fällt, wenn der Platz
eingezeichnet ist.

### Kartenauflösung
Maße bleiben wie geliefert; Unschärfe ist kein Problem. Bei 15,8–36 px pro Feld sind
Tokens klein. Falls sich das am Tisch als Problem zeigt, wird nachskaliert — die
Faktoren stehen in `KARTEN.md`.

---

## Empfohlenes Vorgehen für Folge-Sessions

- **Lore-Session:** `UMBAU-REGELN.md`, `LORE.md`, `NPCS.md`, dann `src/journal/*.yml`
  neu fassen.
- **Karten-Session:** `UMBAU-REGELN.md`, `KARTEN.md`, `CLAUDE.md` (Abschnitt Szenen).
  Das Karten-ZIP mitbringen.
- **Modul-Session:** `CLAUDE.md` vollständig — besonders den `_key`-Fallstrick, der
  einen leeren Pack mit Exit-Code 0 erzeugt. Nach jeder Änderung
  `node build/build.mjs && node build/verify.mjs`.
- **Statblock-Session:** `NPCS.md` für Gildrun, `src/creatures/` als Muster.

Branch: `claude/caverns-blackthorn-foundry-5nz9j0`.

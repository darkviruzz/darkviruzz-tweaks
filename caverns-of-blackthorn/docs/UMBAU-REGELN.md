# Regeln für den Umbau

Gilt für jede Session, die `src/` anfasst. Die inhaltlichen Entscheidungen stehen in
`LORE.md`, `NPCS.md`, `HOOKS.md` und `KARTEN.md`; hier steht, **wie** sie ins Modul
kommen.

Technische Fallstricke des Pack-Formats stehen in `CLAUDE.md`. Diese Datei
wiederholt sie nicht.

---

## A · Was am Ende im Modul stehen muss

1. **Aufhänger sind Angebote, keine Bahn.** Mehrere Einstiege nebeneinander, jeder
   für sich benutzbar, keiner Voraussetzung für den nächsten. Kein Satz im Journal
   sagt, was die Gruppe tun wird.
2. **Eine Fassung der Völkergeschichte.** Wer wie lebte, was ihm zustieß, warum er
   heute dort ist, wo er ist — dieselbe Fassung an jeder Stelle des Moduls.
3. **NPCs mit Motiv, Persönlichkeit und Spielhilfe.** Jeder benannte NPC bringt:
   Ziel, wie man ihn spricht, eine Reaktionstabelle, und wo Werte liegen.
4. **Karten als Szenen mit den wesentlichen Pins.** Jede Karte wird eine Szene, jede
   Szene trägt die Pins aus `KARTEN.md` Abschnitt 3, jeder Pin öffnet eine Seite,
   die es gibt.

---

## B · Wie die Texte geschrieben werden

5. **Das Journal spricht in der Gegenwart.** Keine Entstehungsgeschichte, keine
   Versionshinweise, keine verworfenen Varianten, kein „ursprünglich war". Was nicht
   gilt, steht nicht drin.
6. **Keine festen Datumsangaben im Inhalt.** Zeit wird relativ erzählt — „vor gut
   einem Jahrzehnt", „im letzten Herbst", „tiefer Winter". So bleibt das Modul an
   den Kampagnen-Zeitstrahl anschließbar, ohne dass eine Jahreszahl irgendwo
   widerspricht.
7. **Spielertext und DM-Text sind getrennt.** Vorlesetext in eigenen Blöcken,
   DM-Wissen in eigenen Abschnitten oder eigenen Seiten. Nichts, was die Spieler
   nicht sehen sollen, steht mitten in einem Absatz, den man am Tisch aufklappt.
8. **Die Quelle wird nicht benannt.** Fakten übernehmen, Prosa selbst schreiben.
   Keine Verweise auf ein Vorlagenwerk im Produkt.
9. **Deutsch durchgehend**, auch Kreaturen- und Gegenstandsnamen.
10. **Enricher statt getippter Zahlen** (`[[/attack extended]]`,
    `[[/damage average extended]]`, `[[/item .<id>]]`). Text und Mechanik dürfen
    nicht auseinanderlaufen können.

---

## C · Struktur im Modul

11. **Ein Schlüssel für Karte, Szene, Seite und Pin.** Kartennummer 01–10, überall
    dieselbe. Seitenschlüssel `ort-<nr>-<name>`, `area`-Flag = Kartennummer,
    Szenen-`sort` in Spielreihenfolge.
12. **Jede Ortsseite hat dieselbe Gliederung**, damit der DM am Tisch nicht sucht:

    1. Was man sieht (vorlesbar)
    2. Wer da ist und was er will
    3. Wenn gekämpft wird — Besetzung, XP-Summe, Budget-Einordnung
    4. Wenn geredet wird — Gesprächspartner, SG, mindestens ein gewaltfreier Ausgang
    5. Was zu holen ist — Beute *und* Information
    6. Wohin es weitergeht

13. **Jeder verhandelbare NPC bringt fünf Dinge mit:** Ziel in einem Satz, einen
    Eröffnungssatz zum Vorlesen, eine SG-Leiter mit Begründung, mindestens einen
    Ausgang ohne Gewalt, und was er tut, wenn er angegriffen wird.
14. **Alarmstufen statt Zufallsbegegnungstabelle.** Was die Gruppe trifft, ist Folge
    dessen, was sie getan hat.
15. **Skalierung liegt bei 4 Äquivalenten als Basis**, mit einer zweiten Spalte für
    5. Drei Spieler auf Stufe 7 plus Sidekicks; es darf anstrengend werden.

---

## D · Technik

16. **Kreaturentypen nach SRD 2024.** Hobgoblin und Bugbear sind `fey` mit Subtyp
    Goblinoid, Gnolle sind `fiend`, Oger sind `giant`. Das ist mechanisch relevant:
    Zauber gegen Humanoide greifen bei Goblinoiden nicht.
17. **Zahlen rechnet der Generator.** XP-Summen, Budget-Einordnungen, Angriffsboni —
    keine handgepflegten Summen im YAML.
18. **Pins brauchen `entryId` und `pageId`**, und die Zielseite muss existieren,
    bevor der Pin gesetzt wird. Ein fehlender `pageId` öffnet beim Klick nichts, ohne
    Fehlermeldung.
19. **Tokens starten `hidden: true`**, Größen kommen aus der Kreatur, nicht aus einem
    Default.
20. **Assets:** eigene Zeichnungen, kein eingebranntes Raster, jeder
    `modules/caverns-of-blackthorn/...`-Pfad muss auf der Platte liegen. Zwei
    Skripte dürfen nie denselben Dateinamen schreiben.
21. **IDs bleiben deterministisch.** Ein Rebuild darf keine Referenz zerreißen und
    kein Dokument doppeln. Wer einen Seed-String ändert, ändert eine ID — das ist ein
    bewusster Schritt, kein Nebeneffekt.

---

## E · Fertig heißt

22. `node build/build.mjs && node build/verify.mjs` läuft grün.
23. **`docs/` ist die Quelle für Inhalt, das Journal folgt.** Wer eine Lore-Aussage
    ändert, ändert sie in `docs/` und zieht das Journal nach — nicht umgekehrt und
    nicht nur an einer der beiden Stellen.
24. **`CLAUDE.md` wird im selben Change aktualisiert**, wenn dabei etwas über
    Foundry, dnd5e oder das Pack-Format gelernt wurde.
25. Der Branch heißt `claude/caverns-blackthorn-foundry-5nz9j0`, solange nichts
    anderes vereinbart ist.

---

## Offene Punkte, die beim Umbau erledigt werden

Jeweils mit der Regel, die sie betreffen:

| Punkt | Regel |
|---|---|
| Journalseiten auf den Stand aus `LORE.md` bringen | A2, B5 |
| Seiten- und Szenenschlüssel auf das Kartenschema `ort-<nr>-…` umstellen | C11 |
| Zehn Karten nach `assets/maps/`, zehn Szenen bauen, Platzhalterkarte entfernen | A4, D20 |
| Terrainwände am Spalt in `ort-03-fontaene` | A4 |
| Bugbear-Bezirk auf Karte 07 einzeichnen und bepinnen | A4 |
| Mehrere Pins je Szene ermöglichen (`key`-Feld in `scene.mjs`) | A4, D18 |
| Goblinoide auf `fey` / Subtyp Goblinoid umstellen | D16 |
| Gildruns Statblock anlegen (Werte in `NPCS.md`) | A3 |
| Hurrek und Brakka als benannte NPCs in die Ortsseiten | A3, C13 |
| Wachposten in `ort-02-pilzhoehle` auf ein angemessenes Niveau für den ersten Kampf bringen (ein Hobgoblin-Drillmeister, +700 XP) | C15 |
| Skalierungstabelle um die Spalte für 5 Äquivalente ergänzen | C15 |
| Alle Ortsseiten auf die sechsteilige Gliederung bringen | C12 |

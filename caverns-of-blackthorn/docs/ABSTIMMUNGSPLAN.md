# Blackthorn – Abstimmungsplan und zusammengeführter Arbeitsstand

## Aktueller Beschlussstand

Die spielbare Arbeitsfassung ist angenommen. Wiederholbare TP-Heilung ist ausdrücklich erwünscht; Zauberplätze und begrenzte Fähigkeiten bleiben verbraucht. Keine harte Grenze hinter den Duergarposten. Die älteren offenen Fragen hierzu sind erledigt. Targ soll einen Pomarj-Anschluss erhalten; der Quellenabgleich und die eigenständig ausgearbeitete Ergänzung stehen in `Blackthorn-Pomarj-Targ-Abgleich.md` und im Targ-Abschnitt der Arbeitsfassung. Die konkrete Ausgestaltung wird jetzt vorgestellt, nicht als früher gespielter Fakt behandelt. Keine Modulquellenänderung.


Stand 19.09.2026. Abgleich des Branches `claude/caverns-blackthorn-foundry-5nz9j0` bis `42b956b` mit den Entscheidungen dieser Unterhaltung, den Kampagnenunterlagen und den lokal vorliegenden Karten. Dies ist eine Arbeitsgrundlage für die schrittweise Abstimmung, keine vorweggenommene Abenteuerlösung.

## Arbeitsweise

**Aktualisierung nach Nutzerauftrag:** Die weitere Ausarbeitung erfolgt jetzt eigenständig mit plausiblen Entscheidungen und anschließendem Review. Die bisherige Pflicht, jede Frage einzeln vorab zu stellen, entfällt. Die Entscheidungen und Szenarioprüfungen stehen in `Blackthorn-Spielbare-Arbeitsfassung.md`. Fragen 01–26 einschließlich 17a sind dort bearbeitet; 27–31 bleiben als technische Umsetzung und tatsächliche Balance-/Sichtprüfung nach der inhaltlichen Durchsicht. Orks als unmittelbare Ogeraufseher und als Wache Richtung 07 sind inzwischen ausdrücklich bestätigt. Die nachfolgenden historischen Fragezeilen bleiben als nachvollziehbare Checkliste erhalten.

Wir behandeln jeweils nur einen Entscheidungspunkt. Festgehalten werden Beschluss, Auswirkungen auf andere Punkte und betroffene Dokumente. Bereits ausdrücklich beschlossene Fakten werden nicht erneut zur Abstimmung gestellt. Vorschläge von Claude und Codex sind ohne Annahme keine Fakten. Bei echten Widersprüchen bleibt eine klar benannte Frage offen. Eine neue Entscheidung kann einen früheren Beschluss ändern, aber nur ausdrücklich und mit benannten Folgen.

Das Ziel ist ein räumlich und sozial nachvollziehbarer Ort mit eigenen Entwicklungen, in den die Spieler eingreifen. Erfolge, Kämpfe, Bündnisse und Ausgänge folgen daraus. Keine festgelegte Reihenfolge und kein garantierter Ausgang. Ein begrenzter Erfolg oder ein Rückzug kann sinnvoll sein; die Gruppe muss nicht den gesamten Clan befrieden oder besiegen.

## 1. Quellenstand und Erhalt der Arbeit

- Git-Arbeitsbaum vor dem Abruf sauber. Fetch und anschließendes Fast-forward von `2247b65` auf `42b956b`; keine lokalen Repository-Änderungen überschrieben. Git bewahrt den vorherigen Stand.
- Unsere Entscheidungen liegen weiterhin in `Blackthorn-Lore-Entscheidungen.md` neben diesem Bericht und bleiben erhalten. Die älteren Prüfberichte sind Vorarbeiten, keine konkurrierenden Kanonfassungen.
- Der neue Commit ändert sieben Dokumente, keine Karten oder `src/`-Inhalte. Claudes gemeldeter erfolgreicher Build ist eine technische Aussage über seinen Stand, kein Beleg für stimmige Lore. Für diesen Dokumentabgleich wurde kein neuer Build ausgeführt.
- Die Karten liegen lokal unter `C:\Users\nogar\Downloads\Blackthorn-Neufassung-Komplett\Einzelkarten`. Die für den Bau relevanten Einzelkarten 01–09 wurden visuell geprüft; 03 und 06 sind ein gemeinsames Bild. Die Übersicht und eine separat extrahierte Archivvariante zeigen bei der Darstellung einen beschädigten unteren Bildbereich. Fehlende Verbindungen werden nicht aus dem unsichtbaren Teil erfunden.
- World Anvil gilt auf ausdrücklichen Wunsch als maßgebliche Vorlage/Quasikanon. Die gespielte Kampagne und ausdrücklich beschlossene Anpassungen haben bei Abweichungen Vorrang. Vault und Charakteroriginale bleiben nur lesend.

## 2. Zusammengeführte Fakten – keine erneuten Grundsatzfragen

| Thema | Verbindlicher gemeinsamer Stand | Behandlung der neuen Texte |
|---|---|---|
| Zeit | Im Modul nur relative Spannen und „Winter“. Interner Einstieg etwa zwei Monate nach Crossford, Stufe 7. | „Tiefer Winter“, feste Jahreszeitabschnitte und erzwungene kurze Abstände nicht übernehmen. |
| Wege | 01 führt über Leiter oder Tunnel nach 02; danach 03. Von 03 nach 07 ausschließlich über 06. | Direkten Gang 03–07 und die daraus abgeleitete Schleife aus älteren Texten entfernen. |
| Gwen | Etwa 15, Bugbear, ehrlich, ungewöhnlich reflektiert. Großmutter vermittelt frühere Lebensweise; hobgoblinische Vaterfigur vermittelt Common und praktische Erfahrung im unfreien Versorgungsalltag. | Aussagen zu Gwens Commonkenntnissen, ihrer Motivation und ihrer eigenen Erfahrung müssen sich ausschließlich an den Angaben zu Gwendolyn in `30_NPCs/Gwendolyn` und `10_Campaign/Session Notes/2026/20260810_SpinOffSessionJK38_Notizen` orientieren. |
| Gwen und Gewalt | Befreiungs- und Schutzgewalt akzeptabel; Raub und Unterdrückung auch durch die eigene Gemeinschaft werden abgelehnt. Hilfe beim Aufstand bleibt eine Option. | Keine absolute Pazifistin und keine rein zweckmäßige Ehrlichkeit schreiben. |
| Gwens Zustand | Bei Gruppe, abgereist oder tot möglich; Vertrauen und tatsächliche Ereignisse bestimmen ihr Handeln. | Kein zwingendes Rückgrat, keine Uhr, keine alleinige Schlüsselzeugin. |
| Tempelnachrichten | Vaterfigur war nicht dort. Blackthorn hat zunächst keine zuverlässigen Einzelheiten; Gerüchte möglich. Eine tatsächliche Rückkehr Gwens verändert diesen Stand. | Absolutes dauerndes Nichtwissen streichen. Gildruns Name ist bereits durch den gefundenen Brief bekannt. |
| Garghuk | Außergewöhnlich intelligent; örtlicher gewöhnlicher Krieger, dann Sklave. Organisierte Zusammenarbeit zwischen besiegten Sippen; Waffen ermöglichten den Aufstand. Sicherheit und eigener Machtanspruch sind verflochten. | Kein Aufstand allein durch bessere Picken; keine Behauptung, nur Goblinoide erinnerten sich an Freiheit. |
| Gildrun | Begrenzter Waffenhandel, danach schrittweise Versorgungsschulden. Lenkt durch Preise und attraktive Anrechnung zu Gefangenenverkäufen. Lilakittel-Anschluss, kein universeller Drahtzieher. | Nicht jede heutige Verpflichtung auf den ursprünglichen Waffenvertrag zurückführen. |
| Gefangene | Wissentlich verkauft; inzwischen Gefangennahmen bei Warenüberfällen. Keine Menschenjagden, keine feste Lieferquote. Gold zu überhöhten Preisen wird akzeptiert. | Freikauf nicht durch automatischen Betrug oder stets neue Forderungen entwerten. |
| Versorgung | Eigenproduktion und begrenzte Überfälle tragen einen Teil; Außenhandel schließt Lücken. Mehr Raub ist riskanter und liefert nicht gezielt benötigte Güter. | Keine sofortige Hungerkatastrophe allein durch Gildruns Ausfall; Gold und Tuch sind nicht wertlos. |
| Heilung | Thalertas körperliche Heilung ist Kampagnenfakt. Keshra hat eingeschränkte Beweglichkeit, ist nicht als vollständig gehunfähig gesetzt. Rhogar hat seine Fähigkeiten nicht vollständig verloren. | Grundgedanke der Quelle als weiterer Heilweg passt. Alle Priester pauschal als Gegenleistungsfordernde darzustellen ist nicht belegt. |

Widerspruchsfrei anschlussfähig sind die benannten Vermittlerrollen Hurrek und Brakka, ihre Buchführung bzw. Sorge für Junge sowie eine gut auffindbare Ortsstruktur. Ihre konkreten Motive, Beziehungen und Handlungsmacht bleiben in den untenstehenden Fragen offen. Nicht automatisch Hurrek mit Gwens Vaterfigur gleichsetzen.

## 3. Räumliche Grundlage

Hauptweg von oben: **01 → 02 → 03 → 06 → 07 → 08**. Abzweige von 03 zu 04 und 05. Von 05 führt eine Leiter auf den oberen Canyonpfad, der mit 06 verbunden ist; von dort langer Abstieg zu 09. Die genaue Höhenabwicklung der Leiter und des Pfades liegt in `Blackthorn-Hoehen-Wege-Reisezeiten-30ft.md`. Ein erreichbarer Außenzugang durch die Unterwelt ist noch nicht belegt.

**Folge:** Eine Gruppe von oben muss 06 passieren, um Gwens Sippe oder den Umschlagplatz zu erreichen. Wer 06 kontrolliert, kontrolliert den Hauptzugang zum unteren bewohnten Bereich. Die Quelle liegt dagegen bereits davor. Die Aussage, man müsse für die Quelle erst durch sechshundert Orks, ist räumlich falsch.

**Ogerlücke:** Ja, die heutige Halle 05 war das Ogerlager. Garghuk hat den Raum übernommen. Die überlebenden Oger werden als Arbeitskräfte und Brakka als Mutterfigur beschrieben, aber kein heutiger Wohn- oder Verwahrbereich ist eindeutig zugewiesen. „Ogerlager“ in HOOKS bezeichnet deshalb bislang keinen sauber verorteten Ort. Das ist der erste Entscheidungspunkt.

## 4. Reihenfolge der einzelnen Fragen

### A – Raum und Bevölkerung

| Nr. | Zu klärende Frage | Fakt/Problem | Vorschlag zur Prüfung und Ergebnis |
|---|---|---|---|
| 01 | Wo leben die überlebenden Oger heute? | **Beschlossen:** abgetrenntes, verschließbares Lager am Rand von 06, abseits der Durchgänge. | Lager und Abtrennung bei der späteren Kartenüberarbeitung ergänzen. 05 bleibt Garghuks Halle. |
| 02 | Wer hält die Oger fest und wie? | **Grundmodell beschlossen:** kleine beaufsichtigte Arbeitsgruppen, übrige Oger im Lager; feste Wache auf der Siedlungsseite von 06–07. | Ungefähre Arbeitsgruppe vier bis sechs; endgültige Zahlen, Wachen und kampffähige Erwachsene noch ausarbeiten. Werkzeuge bleiben gefährlich. Koordinierte Befreiung kann die Kontrolle wirklich brechen; keine automatische Loyalität der Oger. |
| 03 | Wie verteilen sich Bewohner und Führung? | Gesamteinwohner, Kriegerzahlen, Familien und nur elf Wohnkomplexe sind nicht abgeglichen. | Vor-Ort-Bevölkerung von Außenverbänden unterscheiden; Raum 07 für Orks, Hobgoblins und Bugbears zuweisen. Bildmöbel sind keine exakte Volkszählung. |
| 04 | Welche Mündungen führen wohin? | 03–07 korrigiert; übrige unbeschriftete Anschlüsse und Canyonleiter bleiben offen. | Jede Öffnung bekommt Ziel, Weglänge/Höhe und Nutzbarkeit für Oger, Transporte und Verletzte. Keine bequeme Fluchtstrecke erfinden. |
| 05 | Wer kontrolliert 02, 03 und 06? | Drei aufeinanderfolgende Engstellen vor 07/08; Quelle liegt in 03. | Diensthabende, Ablösung, Zutrittsrechte, Geleit und Meldewege. Zuerst normale Nutzung, dann Alarm. |
| 06 | Wo sind Gefangene, wer verfügt über sie? | Ringe in 08 sind sichtbar; tatsächliche Bewachung und Übergang der Kontrolle fehlen. | Herkunft, Zahl, Zustand, Bewacher, Garghuks/Gildruns Rechte und Freilassungszuständigkeit. Hauptziel der Rettung bleibt unbeschlossen. |

### B – Personen und Fraktionen

| Nr. | Zu klärende Frage | Fakt/Problem | Vorschlag zur Prüfung und Ergebnis |
|---|---|---|---|
| 07 | Welche konkreten Zugeständnisse macht Garghuk? | Kernmotiv beschlossen; „er will Land“ allein ist zu eng. | Prioritäten zwischen Heimat, Herrschaft und Versorgung; rote Linien, realistische Angebote, eigener nächster Schritt. Keine Bekehrung durch einzelne SG. |
| 08 | Was will Targ konkret, und was weiß er? | „Picken widerlegen Orakel“ ist logisch nicht zwingend. Südlicher Bündnispartner unbenannt. | Wissen, religiöse Deutung, Anhänger, tatsächlich gewünschter Krieg/Vertrag, begrenzte Absprachen trotz Feindschaft. Tod macht Garghuk nicht automatisch zum Rächer. |
| 09 | Braucht es einen zusätzlichen südlichen Pakt? | Gildrun soll primär Lilakittel anschließen; sonst zusätzliche Antagonisten und künstliche Frist. | Streichen oder konkreten Partner, Nutzen, Preis und unabhängige Absicht festlegen. |
| 10 | Wer ist Hurrek im Verhältnis zu Gwen? | Zähler/Drillmeister neu; Vaterfigur bereits beschlossen, aber unbenannt. | Getrennte Figuren oder Zusammenführung wählen. „Zu diszipliniert, um nachzufragen“ erklärt sein Schweigen schlecht; ein tatsächliches Risiko wäre nötig. |
| 11 | Was bindet die Goblinoiden? | Freiheitsschuld, Familie und schlechte Alternativen sind Ansatzpunkte; nicht alle folgen dem besten Preis. | Entscheiden, ob unbestimmte Ehrenschuld besteht, wer sie anerkennt und wer tatsächlich gehen darf. Laufzeitvertrag allein überzeugt nicht automatisch alle. |
| 12 | Was will Brakka, wen vertritt sie? | Schutz der Jungen ist plausibel; zwei Dutzend Oger durch ein Versprechen zu „kaufen“ nicht. | Eigene Beteiligung an früherer Herrschaft, Vertrauensbedingungen, Flucht/Schutz/Rache unterscheiden. Bloßes Sehen von Stahl beweist keine Duergar-Herkunft. |
| 13 | Welche soziale Rolle haben Gnolle? | Familie und Soldvertrag einerseits, absolut unansprechbare Unholde andererseits. | Rudelmotiv, Führung, Vertragstreue und erreichbare begrenzte Absprachen festlegen; keine beliebige Kampfmaschine. |
| 14 | Wie arbeitet Gildrun vor Ort? | Preisgestaltung beschlossen; Zuständigkeiten, Eskorte, Forderungen und Termine offen. | Begrenzter Reisebestand und Buchauszug, tatsächliche Lieferkette, Fluchtziel, Reaktion auf Gold/Freilassung/Angriff. Keine garantierte Flucht oder automatischer Verrat. |

### C – Abenteueranlässe, Hinweise und Quelle

| Nr. | Zu klärende Frage | Fakt/Problem | Vorschlag zur Prüfung und Ergebnis |
|---|---|---|---|
| 15 | Was passiert gerade, auch ohne Spieler? | Bislang mehrere Uhren ohne abgestimmte Ursachen. | Wenige konkrete Vorhaben wählen: Lieferung/Übergabe, Raubzug, interne Forderung. Jeder Vorgang hat Akteur, Anlass, relative Frist und Folgen. |
| 16 | Welche Hooks stehen unabhängig bereit? | Gwen optional; Raubzug, Radagast, Rhogar und Lilakittel verfügbar. | Pro Hook: tatsächliche Information, Motivation, auffindbare Spur und offene Entscheidung. Kein vorgeschriebenes Interesse eines SC; keine zwingend späte Enthüllung zur Armee-Verhinderung. |
| 17 | Welche Hinweise beweisen was? | Farbe, Saatkorn und Waffen werden als automatische Beweise behandelt. | Lila begründet Verdacht, zusätzliche Belege bestätigen konkrete Verbindung. Saatgut kann gegessen werden. Waffen belegen Lieferanten, nicht automatisch Verrat. Mehrere Informationswege. |
| 17a | Wann und wo erhalten die Spieler welche Informationen? | **Verbindliche neue Anforderung:** Kein Vorwissen über die internen Verhältnisse voraussetzen; bereits gespielte persönliche Kenntnisse bleiben bestehen. Nicht alle Informationen werden gefunden. | Informationsverteilung je Ort, Person und Ereignis planen: sichtbarer Hinweis, Zugangsvoraussetzung, Zeitpunkt, Aussagekraft, mögliche Unsicherheit und dadurch informierte Entscheidung. Wichtige Zusammenhänge über mehrere plausible Zugänge erschließbar machen; weder künstlich zurückhalten noch automatisch alles offenlegen. |
| 18 | Wie funktioniert und wem gehört die Quelle? | Kleine Heilung limitiert, volle Heilung unbegrenzt; Regeln und Lichtwirkung uneinheitlich. | Wirkung, Dauer, Wiederholung, entnommenes Wasser, Zugang und Nutzung durch Bewohner. Priesteralternativen und Ley-Kosmologie respektieren. Naturursache nicht ungefragt neu setzen. |
| 19 | Was wissen und tun Begleiter tatsächlich? | Gwen/Silba/Thalerta teils als universelle Schlüssel; Faylith zugleich Figur und Spielleitung bezeichnet. | Aktuelle Teilnahme und Rollen klären, ohne Spielerentscheidungen vorwegzunehmen. Rhogars Gesteinshinweis und Keshras späterer Weg auf echte Grundlage stellen. |

### D – Dynamik und Kampf

| Nr. | Zu klärende Frage | Fakt/Problem | Vorschlag zur Prüfung und Ergebnis |
|---|---|---|---|
| 20 | Wie breitet sich Alarm aus? | Globale Stufen erzeugen unbegrenzte Gegner; Wiedererkennen löst automatisch Jagd aus. | Lokales Wissen, Läufer/Hörner, reale Wege, vorhandene Reserven. Hörner draußen gegen Geheimhaltung abwägen. Identität allein ist kein Angriff. |
| 21 | Was geschieht bei einem frühen Gefecht? | 02 sperrt den weiteren Weg, 03/06 weitere Engstellen. | Reaktionen auf Streit, getötete Wachen und Einbruch unterscheiden; Waffenruhe, Rückzug, Geiseln, Durchbruch anhand tatsächlicher Lage. |
| 22 | Welche Kampfgelegenheiten bleiben bei Diplomatie? | Ein gültiges Geleit darf nicht durch Zufallsverrat entwertet werden. | Konkrete örtliche Konflikte/Parteien auswählen; Umfang des Geleits, neutrale Bereiche und Interessen benennen. Kein garantierter Kampf auf jedem friedlichen Weg. |
| 23 | Was tun Parteien nach Tod/Flucht ihrer Führung? | Automatiken statt Nachfolge und Informationswegen. | Pro Anführer unmittelbare Zeugen, Befehlshaber, Schutz der Familien, mögliche Verhandlung und Vergeltung. Keine globale Gesinnungsumschaltung. |
| 24 | Wie reagieren Ort und Gegner auf ungewöhnliche Ideen? | Stealth, Magie, Bestechung, Gegenhandel, Brand, Armee oder Abzug dürfen nicht einfach scheitern müssen. | Durchspielen mit echten Wegen und Ressourcen. NSCs lernen nur, was sie erfahren. Folgen statt vorsorglicher Immunitäten. |
| 25 | Wo kann man rasten und wie lange bleibt Zeit? | Zwei bis drei lange Rasten geplant, gleichzeitig „keine Rastmöglichkeit“, Abtransport in Stunden und Händler erst in Tagen. | Schutzräume, Rückzug und tatsächliche Termine abstimmen. Kein Ereignis nur deshalb verschieben, weil die Spieler noch nicht bereit sind. |
| 26 | Wie endet ein begrenzter Erfolg? | Rettung, Quelle, Aufklärung, Handel und Gildruns Schicksal sind verschiedene Ergebnisse. | Für jede gewählte Aktion unmittelbare Folgen und nächsten Schritt der Betroffenen, keine vorgeschriebene Komplettlösung oder Fortsetzung. |

### E – Mechanik und Umsetzung nach der Abstimmung

27. Tatsächliche Gruppe und Sidekicks festlegen; Gegnerzahlen und Ressourcen anhand realer Aktionsmöglichkeiten prüfen. HG-Vorschlag ist kein geprüftes Begegnungsbudget. Bewohnerzahlen sind keine Encounterliste.

28. Gildruns Sonderfähigkeiten prüfen: Schaden umleiten ohne Ursache/Einwilligung, unbegrenztes Markierungs-Vorteilfenster, „Betäubung“ als Giftschaden, Reaktion bei 0 TP und Entkommen beim Erreichen irgendeines Ausgangs sind nicht ausreichend definiert. Keine Plot-Unverwundbarkeit.

29. Licht, Unsichtbarkeit, Klettern, Absturz und Canyon anhand der gewählten Spielregeln ausarbeiten. Helles Licht ist nicht automatisch Sonnenlicht; Oger erhalten nicht allein durch ihre Spezies Lichtscheu. Eine misslungene Kletterprobe bedeutet nicht unabhängig von Sicherung sofort 500 Fuß Fall. Technische Bewegungswände müssen Fliegen und Klettern zulassen bzw. vom DM übersteuerbar sein.

30. Karten und Szenen integrieren: neun Einzelbilder für zehn Ortsnummern, da 03/06 gemeinsam sind; keine zehn voneinander getrennten Szenen erzwingen. 5-/10-Fuß-Umrechnung, Seiten-Pins, Sichtlinien und Höhen prüfen. Der gezeichnete kurze Treppenlauf ist bei 500 Fuß Höhenunterschied schematisch; keine Flächenentfernung als Reisezeit verwenden.

31. Konsolidierte Lore/NSCs/Hooks schreiben, anschließend Ortsjournale und erst dann Werte, Szenen und Pins. Alte Aussagen gezielt ersetzen, ungeklärte Punkte nicht beiläufig entscheiden. Build/Verifier plus Sichtprüfung und narrative Szenariotests; danach gesonderter veröffentlichbarer Stand.

## 5. Prüfung aller 25 Umbau-Regeln

Die folgende Bewertung betrifft ihre Eignung für das vereinbarte Abenteuer. Sie erklärt nicht ungeprüfte technische Behauptungen zu gesicherten APIs.

| Regel | Bewertung | Anpassung/Grund |
|---|---|---|
| A1 Hooks als Angebote | Übernehmen | Muss auch in HOOKS gelten: keine erzwungenen Entscheidungen, keine Pflicht-Gwen. |
| A2 eine Geschichte | Übernehmen | Eine gültige Vorgeschichte, aber mehrere mögliche Gegenwartszustände nach Spieleraktionen. |
| A3 Motive/Spielhilfen | Ergänzen | Eigenständiger nächster Schritt, Wissen, Mittel, Grenzen und Folgen bei Führungsausfall. |
| A4 Karten/Pins | Präzisieren | 03/06 teilen eine Szene. Pins nach Bedarf, nicht jede Karte erzwingt ein neues Bild. |
| B5 nur Gegenwart/keine Entstehungsgeschichte | Ändern | Versionsgeschichte weglassen; relevante innerweltliche Vorgeschichte ist für Motive zwingend nötig. |
| B6 relative Zeit | Übernehmen mit Korrektur | Jahreszeit nur „Winter“ gemäß Nutzer; relative Angaben garantieren nicht von selbst Konsistenz. |
| B7 Spieler-/DM-Text trennen | Übernehmen | Zusätzlich echte Freigaben prüfen: Absatztrennung allein schützt keine geteilte Seite. |
| B8 Quelle nicht benennen | Nicht als Pauschalregel übernehmen | Quellenhinweise gehören nicht in Vorlesetext, können aber in Credits stehen; vorhandene Attribution nicht blind entfernen. |
| B9 Deutsch | Übernehmen | Eigennamen und technische Schlüssel bleiben bei Bedarf unverändert. |
| B10 Enricher statt Zahlen | Technisch sinnvoll, begrenzen | Angriffe/Würfe zentral halten; erzählerische Mengen, Zeiten und klare Beschreibungen bleiben zulässig. |
| C11 gemeinsamer Schlüssel | Präzisieren | Stabile Zuordnung, aber eine Szene kann mehrere Ortsseiten haben; Migration bestehender IDs berücksichtigen. |
| C12 sechs Abschnitte je Ort | Als flexible Vorlage | Leere Kampf-/Gesprächsabschnitte vermeiden. Keine SG oder friedliche Lösung dort erfinden, wo sie sachlich nicht besteht. |
| C13 SG-Leiter/gewaltfreier Ausgang | Ändern | Motive und konkrete Angebote zuerst. Eine Probe überschreibt keine Grenze; Möglichkeiten sind keine Erfolgsgarantie. |
| C14 Alarm statt Zufall | Ändern | Alarm reagiert auf Spieler; Alltag, Fraktionspläne und äußere Entwicklungen laufen auch ohne sie. Zufall optional, nicht grundsätzlich verboten. |
| C15 vier/fünf Äquivalente | Vorläufig | Tatsächliche Sidekicks und Gruppe bestimmen Stärke; kein pauschaler Anspruch auf bestimmte Kampfzahl. |
| D16 Kreaturentypen | Bei Umsetzung regeltechnisch prüfen | Typen bestimmen Zielbarkeit, nicht automatisch Kultur, Herkunft jeder Person oder Verhandelbarkeit. |
| D17 Generator berechnet Zahlen | Übernehmen | Konsistente technische Summen beweisen kein gutes Encounterdesign. |
| D18 Pin-Verweise | Beibehalten, testen | Tatsächliche Seitenöffnung in Foundry prüfen, nicht nur Existenz der IDs. |
| D19 Tokens verborgen | Übernehmen als Importvorgabe | DM muss relevante sichtbare Bewohner anschließend einblenden. |
| D20 Assets | Übernehmen | Tatsächliche Dateien, freie Pfade, keine gegenseitige Überschreibung. |
| D21 deterministische IDs | Übernehmen | Schlüsseländerungen gezielt migrieren, nicht beiläufig alte Verweise zerstören. |
| E22 Build/Verifier | Notwendig, unzureichend | Ergänzen um Kartensichtprüfung, Chronologie, Wege und Reaktionsszenarien. |
| E23 Docs sind Quelle | Präzisieren | Erst konsolidierte, beschlossene Docs; importierte widersprüchliche Texte nicht allein durch Überschrift zum Kanon machen. |
| E24 technische Erkenntnisse dokumentieren | Übernehmen | Bestätigte Erkenntnisse von Vermutungen unterscheiden. |
| E25 Branch | Übernehmen | Angegebener Branch bleibt Arbeitsgrundlage. |

## 6. Weitere Widersprüche und redaktionelle Korrekturen

- Keine vorgeschriebenen SC-Handlungen: „Uhtred wird diesen wollen“, „er darf nicht“, „niemand will abmarschieren“ und „Gildrun entkommt“ durch tatsächliche Angebote und bedingte Folgen ersetzen.
- Keine moralische Spielleiterfreigabe zum Töten eines NSC und kein erzwungenes schlechtes Ende bei Nichtstun. Eine Waldläuferoperation braucht eigene Information, Planung und Ziele; zweihundert Tote sind kein pauschaler Preis für andere Spielerprioritäten.
- Quelle vor der Orksiedlung: Heilung braucht Zugang zu 03, nicht zwangsläufig Durchquerung von 07. Dauerhaft sicheres Geleit kann hilfreich sein, ist nicht die einzig denkbare Lösung.
- „Alle Priester wollen Gegenleistungen“ als allgemeine Wahrheit streichen; eine Quelle erhebt selbst keine Forderung, ihre Besitzer können trotzdem Zugang verlangen. Thalertas Heilung bleibt real, auch wenn nicht jeder Ortsabschnitt sie erwähnt.
- „Gold und Tuch bleiben liegen“ widerspricht wertvollen Zahlungsmitteln. Nur konkrete Transportprioritäten erklären bewusst zurückgelassene Beute.
- Hurreks „vier Winter“ passt ohne weitere Erklärung nicht zum knapp zwei Jahre alten Befreiungsverhältnis; auch sein Buch zählt Forderungen in die entgegengesetzte Richtung zur angeblichen eigenen Ehrenschuld. Bei Frage 10/11 klären.
- Versorgung kann nicht zugleich vorhandenes Gewerbe und komplett verlernte Fähigkeiten sein. Praktische Führung und Versorgung liefen während der Unfreiheit weiter.
- Geheimhaltung ist kein Spurenverbot: Überfälle, Weiden, Hörner, Kontakte und Nachrichten erzeugen Hinweise. Unsichtbare Abraumhalden bedeuten keine unsichtbare Bevölkerung.
- Gildruns getragene Unterlagen müssen nicht das einzige Archiv zweier Generationen sein. Alternative Belege und Gefangenenberichte verhindern einen einzelnen Informationsengpass.
- „Südlicher Kult“ darf als portable Formulierung genutzt werden, soll aber die tatsächlichen schon bekannten Tempelereignisse nicht verändern. Söldnerbeschwerden über Sold passen nicht ohne Zusatzannahme zum Verkauf der gesamten Sippe als Sklaven.

## 7. Abschlussprüfung vor der Modulübernahme

**Informationsprüfung:** Für friedlichen Eintritt, gewaltsamen Eintritt und heimliche Erkundung nachvollziehen, welche Informationen die Gruppe vor jeder wichtigen Entscheidung tatsächlich erhalten kann. Insbesondere vor dem Betreten weiterer Engstellen, dem Umgang mit Ogern, einem Angriff auf Führungspersonen und einer Gefangenenbefreiung prüfen: Welche Folgen sind erkennbar, welche nur vermutbar, welche bewusst unbekannt? Nicht jedes Geheimnis braucht mehrere Hinweise; entscheidende Handlungsoptionen dürfen aber nicht an einem einzigen NSC, Fundstück oder Wurf hängen. Auch mit verpassten Hinweisen muss das Abenteuer weitergehen. Keine wichtigen Informationen nachträglich verschieben, nur um eine gewünschte Lösung zu erzwingen. Diese Prüfung begleitet bereits Raum- und NSC-Planung und findet nicht erst beim Schreiben der Journale statt.

Jeden Fall kurz durchspielen: friedliche Ankunft; Kampf in 02; unbemerkte Passage durch 02/03; Gwen fehlt oder ist zuvor zurückgekehrt; Goldzahlung; Gefangenenbefreiung in 08 mit Rückweg durch 07/06/03/02; Garghuk stirbt; Gildrun wird gefangen statt getötet; Gruppe kehrt um und kommt mit Hilfe; Quelle wird früh gefunden; einzelne Fraktion verlässt den Clan. Für jeden Fall nur Wissen, verfügbare Akteure, Wege und nächsten Schritt prüfen. Wenn dafür eine neue Ausnahme nötig wäre, ist die Grundlage noch nicht fertig.

**Wir beginnen mit Frage 01: dem heutigen Aufenthaltsort der Oger.**

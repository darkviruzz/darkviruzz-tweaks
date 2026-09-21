# Blackthorn – Vorbereitung der Modulüberarbeitung

## Auftrag und verbindliche Grundlage

Der Nutzer hat die Modulüberarbeitung freigegeben und die Arbeitsfassung einschließlich Targs Pomarj-Verbindung angenommen. Standard sind vier Spielercharaktere auf Stufe 7. Abweichungen werden durch nachvollziehbare Varianten angeboten. Ein Backup existiert; keine Migrationen, Altversionspflege oder Rückwärtskompatibilitätsprüfungen einbauen. Konsistenz der neu erzeugten Dokumente, funktionierende Links und korrekter Import bleiben erforderlich.

Maßgeblich sind `Blackthorn-Spielbare-Arbeitsfassung.md`, der bestätigte Pomarj-Abgleich und die Höhen-/Wege-Datei. Ältere LORE-, NPCS-, HOOKS- und Kartenanweisungen müssen damit synchronisiert werden. Keine erneute Grundsatzabstimmung. Vault und Charakterquellen bleiben ausschließlich lesbar.

## Vorbereitung abgeschlossen

- Quellenstruktur, Journalgenerator, Begegnungsberechnung und Szenenquelle gesichtet.
- Vier SC auf Stufe 7 sind bereits als Journalstandard hinterlegt. Die alte Anweisung „drei Spieler plus Sidekicks“ ist überholt.
- Neun lokale Kartenbilder gefunden; 03 und 06 liegen gemeinsam auf einer Karte. Zehn Ortsnummern bedeuten deshalb nicht zehn unabhängige Bilddateien.
- Veraltete Quellen enthalten andere Bevölkerungszahlen, datierte Varianten, überholte Ogerverhältnisse und eine einzelne Platzhalterszene. Diese Texte werden ersetzt, nicht als alternative spielbare Zeitstände erhalten.
- Bisherige Schwierigkeitsklassifikation markiert bis zum Doppelten des hohen Budgets pauschal als „Hoch“. Gegen das bereitgestellte DMG prüfen und korrigieren; diese Eigenregel nicht als offizielle Vorgabe übernehmen.
- Der Generator kennt Skalierungsbesetzungen, berechnet dafür aber noch keine vergleichbaren XP-Ausgaben. Dies beim Umbau ergänzen.

## Begegnungen: Arbeitsumfang

Die folgenden Besetzungen stammen aus der angenommenen Arbeitsfassung. Sie sind Ausgangslagen, keine Zusage, dass jede davon einen ausgewogenen Kampf bildet. Endgültige XP und Schwierigkeitsangaben folgen erst den gewählten Statblocks.

| Lage | Ausgangsbestand | Besondere Prüfung |
|---|---|---|
| 02 Eingangswache | 1 Orkveteran, 6 Orkkrieger, 2 Gnolljäger | Früher Kampf muss Rückzug und spätere Verständigung zulassen. |
| 03 Quelle | 2 orkische Aufpasser, wechselnde Gärtner | Zivilisten nicht pauschal als Gegner berechnen. |
| 04 Gnolllager | 2 Jäger am Eingang; Rukha und weitere Anwesende nach Tageslage | Kein Kampf gegen das gesamte Rudel als Standard. |
| 05 Halle | Garghuk, gegebenenfalls Targ, 2 Veteranen, 4 Orkkrieger | Gemeinsame Aktionen, Zauber und enge Wege; gestaffelte oder getrennte Konfrontationen aus der tatsächlichen Lage. |
| 06 Grabung | 6 orkische Aufseher, 1 Veteran; 5 arbeitende Oger | Oger können Gegner der Aufseher, Flüchtende oder unbeteiligt sein. Keine automatische Addition aller Oger zum Feindbudget. |
| Tor 06–07 | 1 Veteran, 6 Orkkrieger | Wegezeit und mögliche Überschneidung mit dem Aufseherkampf berücksichtigen. |
| 07 Bereitschaft | 12 Orkkrieger, 1 Veteran | Reserve mit Sammelzeit; nicht in jeder Begegnung erneut verfügbar. |
| 08 Gefangene | 4 Orkkrieger, 1 Veteran | Befreiung, Transport und Durchlass als getrennte Probleme. |
| 08 Duergarposten | Insgesamt 6 Wachen, 2 Verwalter | Konkrete Verteilung auf beide Posten; nicht jeder Händler kämpft mit. |
| Gildruns Ankunft | Gildrun, 1 Duergar-Anführer, 3 Duergar, 1 Steeder | Flucht nach tatsächlichen Fähigkeiten; Überschneidung mit den Posten gesondert ausweisen. |
| Geplanter Raubzug | 12 Orks, 4 Bugbears, 4 Gnolle | Gesamttrupp kann deutlich über einem Standardkampf liegen; Aufklärung, Marschordnung und Teilgruppen beschreiben. |

Jede ausgearbeitete Begegnung erhält Grundbesetzung, errechnete Gesamt-XP, gegebenenfalls XP pro SC, leichtere und schwerere Variante mit neu berechneten Werten sowie Hinweise zu Deckung, Engstellen, Flächenwirkungen und Verstärkungen. Keine alten Multiplikatoren oder pauschalen Sidekick-Äquivalente ungeprüft übernehmen. Die Quelle stellt TP wieder her, aber keine Zauberplätze oder begrenzten Fähigkeiten. Eine hohe Gegnerzahl bleibt auch bei gleichem XP-Wert taktisch relevant.

Skalierung wird vor der Szene aus verfügbaren Bewohnern vorgenommen. Verstärkungen brauchen Herkunft und Laufzeit; keine heimliche Erhöhung mitten im Kampf, weil die Gruppe erfolgreich spielt. Die gesamte Bevölkerung ist kein XP-Vorrat zum Leerrechnen.

## Reihenfolge der Überarbeitung

1. Beschlossene Lore und NPC-Motive in den Dokumenten vereinheitlichen; überholte Regeln korrigieren.
2. Regelwerke und Foundry-Material inventarisieren: Ausgabe, Systemversion, Modulkennungen, Packnamen, Dokument-IDs, verfügbare Kreaturen und Gegenstände. Material lesend prüfen, gewünschte Referenzen anhand realer Ziele bilden. Keine geratenen UUIDs und keine vollständigen lizenzierten Packs ins öffentliche Repository kopieren.
3. Journal neu gliedern: DM-Einstieg, Hooks, Fraktionen, Ereignisse/Informationswege, zehn Ortsbeschreibungen, Begegnungs- und Belohnungsübersicht. Vorlesetext von verborgenem Wissen trennen.
4. Kreaturen und Gegenstände an vorhandenes Material anbinden bzw. notwendige eigene Varianten erstellen. Garghuks Intelligenz, Gildruns begrenzte Fähigkeiten und die besprochene Quellenwirkung umsetzen.
5. Begegnungen für vier Stufe-7-SC berechnen, Varianten erzeugen und auf zusammenhängende Kampfverläufe prüfen.
6. Karten in Szenen übernehmen; Raster, Höhen, Wände, Licht, Tokens und Pins an tatsächlichen Bildpositionen prüfen. Gemeinsame Karte 03/06 und die korrigierten Wege berücksichtigen.
7. Aktuelle Ausgabe bauen, Referenzen und Inhalte prüfen; anschließend Import und Darstellung in der Zielumgebung prüfen, soweit diese zugänglich ist. Keine Rückwärtskompatibilitätsprüfung.

## Noch benötigte Angaben

Beide Fragen sind beantwortet: Standard sind vier SC ohne Kampfunterstützung; Begleiter werden optional berücksichtigt. Friedlich oder durch List gelöste Konflikte geben gleichwertige einmalige XP. Derselbe gelöste Konflikt wird bei späterem Kampf nicht erneut belohnt; bloßes Treffen oder Vorbeigehen vergibt nicht die XP sämtlicher anwesender Bewohner. Die Bereitstellung der angekündigten PHB-/DMG-/MM- und Foundry-Dateien ist für konkrete Regel- und Dokumentreferenzen nötig. Zielversionen zunächst aus diesen Dateien ermitteln, statt zusätzliche Versionsfragen zu stellen.

Dies ist die Umbauvorbereitung, noch keine fertige Begegnungsbewertung und kein ausgeliefertes Modul.

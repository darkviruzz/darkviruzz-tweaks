# Die Höhlen von Blackthorn

Greyhawk-Abenteuer für vier Charaktere auf Stufe 7 im Winter. Neun Szenen bilden zehn Orte ab; Springbrunnen und Grabung teilen eine Karte. Die Gemeinschaft verfolgt eigene Ziele. Kampf, Verhandlung, List und begrenzte Erfolge verändern den Ort.

## Installation

Den Ordner caverns-of-blackthorn aus dem ZIP nach Data/modules kopieren. module.json liegt direkt in diesem Ordner. Foundry aktualisieren, das Modul und seine benötigten Pakete aktivieren, dann das Kompendium **Blackthorn — Abenteuer (Import)** öffnen und importieren.

- Foundry VTT 14, geprüftes Datenformat 14.364; dnd5e 5.3.3.
- Monster Manual und Player’s Handbook benötigt; Dungeon Master’s Guide für den Regelverweis empfohlen.
- Referenzen geprüft gegen MM 1.4.0, PHB 2.2.0, DMG 2.0.0.
- Die Bildverweise namenloser Gegner stammen aus dem lokalen TMTO-Katalog und laden beim Anzeigen aus dessen Online-Archiv. Das TMTO-Modul ist für die festen Bildverweise optional. Zufallsfilter und eigene Bildbeschreibungen stehen in ARTWORK.md.

## Spielmaterial

18 Kreaturen, sieben Gegenstände, 21 Journalseiten, neun Szenen mit 5-ft-Raster und 46 Orts-Pins. Vorbereitete Tokens stehen auf Szenenhöhe 0 und beginnen verborgen; der DM blendet Anwesende ein. Höhlentiefen und Wegezeiten stehen in den Ortsseiten. Auf der gemeinsamen Karte 03/06 ist die lange Treppe verkürzt dargestellt.

Die Quelle heilt bei einer Runde Wundversorgung 2W4+2 TP. Ein einminütiges Heilbad stellt volle TP her und heilt Krankheiten, körperliche Schäden und körperlich wirkende Flüche. Verbrauchte Zauberplätze und Rastfähigkeiten bleiben verbraucht.

XP-Budgets für vier SC: 3.000 / 5.200 / 6.800. Gleichwertige Lösungen durch List und Verhandlung bringen einmalig dieselben Konflikt-XP. Die Ortsseiten enthalten Varianten für leichtere und schwerere Begegnungen.

## Fähigkeiten in Foundry

Unsichtbarkeit und Vergrößern besitzen verknüpfte Active Effects. Vergrößern setzt Größe Groß, Vorteil auf Stärkewürfe und Stärkerettungswürfe sowie 1W6 zusätzlichen Wuchtschaden auf Waffenangriffe. Unsichtbarkeit setzt den Zustand Unsichtbar. Vorzeitige Endbedingungen wie Angriff oder Bewusstlosigkeit überwacht der DM und entfernt den Effekt entsprechend. Garghuks Glücksstein ist getragen und eingestimmt; seine Boni werden durch den Gegenstand vergeben. Adrenalinschub hat eine Aktivität für drei temporäre TP. Targs Zauber verweisen auf das PHB.

Formationsabstände, bedingte Angriffsboni, Steeder-Sprünge und die insgesamt zehn Minuten der Stiefel der Schnelligkeit verwaltet der DM anhand der Beschreibungen. Die eigenen HG sind Einschätzungen für die Abenteuerwerte.

## Entwicklung und Prüfung

YAML-Quellen unter src/, Hintergrund unter docs/, Generatoren unter build/. Build und Pack-Rücklesung erfolgen offline. Acht gezielte Tests prüfen Fähigkeiten, Ausrüstung, Token-Höhen, Waffen, XP und Pins. Die Core-Prüfung nutzt echte Foundry-Dokumentklassen; Darstellung und Bedienung prüft der Nutzer in seiner Welt.

Prüfbefehle: node --test build/test.mjs; node build/build.mjs; node build/verify.mjs --core <Foundry> --data <UserData/Data>; node build/verify-core.mjs --core <Foundry> --system <UserData/Data/systems/dnd5e>.

## Herkunft

Private Fan-Adaption für die Falken des Selintan. Abenteuerprosa und individuelle Varianten sind für diese Kampagne gestaltet. Regelpakete und externe Bilder bleiben ihre eigenen Quellen; ihre Originaldateien werden nicht mitgeliefert.

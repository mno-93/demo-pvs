"""Falldatei der Dosierungstexte aus der Referenzimplementierung von HL7 Deutschland.

Die Eingaben — Name und `Dosage`-Elemente je Fall — stehen in
`packages/kern/src/fachlogik/dosierungstext.faelle.json`. Das Skript lässt jede Eingabe von der
Referenzimplementierung (`medication-dosage-to-text.py` aus
`hl7germany/dgMP-DosageTextgenerierung-Skript`) als `MedicationRequest.dosageInstruction` in Text
übersetzen und schreibt Text oder Fehlermeldung, Version und Commit der Referenz in die Datei.
Der Test `dosierungstext.test.ts` vergleicht die TypeScript-Fassung im Kern mit diesen Werten.

Aufruf im Repository-Ordner, `DOSIERUNG_REFERENZ` = Klon der Referenz:

    python werkzeuge/dosierungsfaelle-erzeugen.py            # schreibt die Falldatei
    python werkzeuge/dosierungsfaelle-erzeugen.py --pruefen  # vergleicht nur, Exit 1 bei Abweichung

Nach dem Schreiben `npx prettier --write` auf die Datei. Braucht Python ab 3.9 mit
Zeitzonendaten; unter Windows das Paket `tzdata`.
"""

import importlib.util
import json
import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

DATEI = (
    Path(__file__).resolve().parent.parent
    / 'packages'
    / 'kern'
    / 'src'
    / 'fachlogik'
    / 'dosierungstext.faelle.json'
)
QUELLE = 'hl7germany/dgMP-DosageTextgenerierung-Skript'


def referenz_laden(ordner: Path):
    skript = ordner / 'medication-dosage-to-text.py'
    if not skript.is_file():
        sys.exit(f'Keine Referenzimplementierung in {ordner} (medication-dosage-to-text.py fehlt).')
    spec = importlib.util.spec_from_file_location('dosierung_referenz', skript)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def commit_von(ordner: Path) -> str:
    ergebnis = subprocess.run(
        ['git', '-C', str(ordner), 'rev-parse', '--short=7', 'HEAD'],
        capture_output=True,
        text=True,
        check=True,
    )
    return ergebnis.stdout.strip()


def ohne_dezimal(wert):
    """Decimal zurück in eine JSON-Zahl — nur, wenn JavaScript sie genauso liest."""
    if isinstance(wert, Decimal):
        zahl = float(wert)
        # So schreibt JavaScript die Zahl: 0.5 bleibt 0.5, aus 1.0 wird 1.
        in_javascript = repr(zahl)[:-2] if repr(zahl).endswith('.0') else repr(zahl)
        if in_javascript != str(wert):
            sys.exit(
                f'Zahl {wert} verliert in JavaScript ihre Schreibweise; '
                'solche Fälle gehören nicht in die Falldatei.'
            )
        return zahl
    if isinstance(wert, list):
        return [ohne_dezimal(x) for x in wert]
    if isinstance(wert, dict):
        return {k: ohne_dezimal(v) for k, v in wert.items()}
    return wert


def main() -> int:
    # Meldungen mit Umlauten auch in einer Windows-Konsole.
    sys.stdout.reconfigure(encoding='utf-8')
    pruefen = '--pruefen' in sys.argv[1:]
    pfad = os.environ.get('DOSIERUNG_REFERENZ')
    if not pfad:
        sys.exit(f'DOSIERUNG_REFERENZ fehlt: Pfad zu einem Klon von {QUELLE}.')
    ordner = Path(pfad)
    referenz = referenz_laden(ordner)
    erzeuger = referenz.MedicationDosageTextGenerator()

    # Wie die Referenz selbst: Dezimalzahlen als Decimal, damit 2.50 nicht 2.5 wird.
    bisher_text = DATEI.read_text(encoding='utf-8')
    bisher = json.loads(bisher_text, parse_float=Decimal)

    faelle = []
    for fall in bisher['faelle']:
        neu = {'name': fall['name'], 'dosage': fall['dosage']}
        try:
            neu['text'] = erzeuger.generate_dosage_text(
                {'resourceType': 'MedicationRequest', 'dosageInstruction': fall['dosage']}
            )
        except ValueError as fehler:
            neu['fehler'] = str(fehler)
        faelle.append(neu)

    ergebnis = ohne_dezimal(
        {
            'quelle': QUELLE,
            'version': referenz.__version__,
            'commit': commit_von(ordner),
            'faelle': faelle,
        }
    )
    erwartet = json.loads(bisher_text)

    if pruefen:
        abweichend = [
            f['name']
            for f, e in zip(ergebnis['faelle'], erwartet['faelle'])
            if f != e
        ]
        kopf = {k: v for k, v in ergebnis.items() if k != 'faelle'}
        kopf_bisher = {k: v for k, v in erwartet.items() if k != 'faelle'}
        if kopf != kopf_bisher:
            print(f'Kopf weicht ab: {kopf_bisher} → {kopf}')
        for name in abweichend:
            print(f'Fall weicht ab: {name}')
        if kopf != kopf_bisher or abweichend:
            return 1
        print(f'{len(faelle)} Fälle gleich der Referenz {kopf["version"]} ({kopf["commit"]}).')
        return 0

    DATEI.write_text(
        json.dumps(ergebnis, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n'
    )
    print(f'{len(faelle)} Fälle geschrieben ({ergebnis["version"]}, {ergebnis["commit"]}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

import {
  quartalVon,
  type Allergie,
  type Behandlungsfall,
  type Diagnose,
  type Karteikarteneintrag,
  type Kuerzel,
  type Leistungsziffer,
  type Medikationsspiegel,
  type LokalesDokument,
  type Dokumentart,
  type Nutzer,
  type Patient,
  type Rezept,
  type Impfung,
  type Rezeptfreigabe,
  type Terminstatus,
} from '@demo-pvs/kern';
import type { Vorgang } from './speicher.js';
import type { EpaGesehen, EpaLesezeichen, Listenordnung, Zustand } from './zustand.js';

/** Erzeugt eine im Ablauf eindeutige Kennung. Reicht für eine Demo ohne Nebenläufigkeit. */
let zaehler = 0;
export function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}-${Date.now().toString(36)}-${zaehler}`;
}

function jetzt(zustand: Zustand): string {
  const uhrzeit = new Date().toTimeString().slice(0, 8);
  return `${zustand.heute}T${uhrzeit}`;
}

/** Sucht den Behandlungsfall des laufenden Quartals oder legt ihn an. */
export function fallFuer(zustand: Zustand, patientId: string): Behandlungsfall {
  const { jahr, quartal } = quartalVon(zustand.heute);
  const vorhanden = zustand.faelle.find(
    (f) => f.patientId === patientId && f.jahr === jahr && f.quartal === quartal,
  );
  if (vorhanden) return vorhanden;
  return {
    id: neueId('fall'),
    patientId,
    jahr,
    quartal,
    fallart: 'ambulant',
    beginn: zustand.heute,
    ueberweiserLanr: null,
  };
}

function mitFall(zustand: Zustand, fall: Behandlungsfall): Zustand {
  if (zustand.faelle.some((f) => f.id === fall.id)) return zustand;
  return { ...zustand, faelle: [...zustand.faelle, fall] };
}

export const vorgaenge = {
  nutzerWechseln(nutzer: Nutzer): Vorgang {
    return {
      name: 'nutzerWechseln',
      beschreibung: `Rolle gewechselt zu ${nutzer.name}`,
      zaehltNicht: true,
      anwenden: (z) => ({ ...z, nutzer }),
    };
  },

  karteneintragAnlegen(patientId: string, kuerzel: Kuerzel, text: string): Vorgang {
    return {
      name: 'karteneintragAnlegen',
      beschreibung: `Karteieintrag ${kuerzel} angelegt`,
      anwenden: (z) => {
        const fall = fallFuer(z, patientId);
        const eintrag: Karteikarteneintrag = {
          id: neueId('kk'),
          patientId,
          fallId: fall.id,
          zeitpunkt: jetzt(z),
          kuerzel,
          text: text.trim(),
          verfasser: z.nutzer.name,
        };
        return { ...mitFall(z, fall), karteikarte: [eintrag, ...z.karteikarte] };
      },
    };
  },

  /** Legt eine Diagnose an. Die Kennung kann vorab vergeben werden, um sie danach zu verknüpfen. */
  diagnoseAnlegen(
    diagnose: Omit<Diagnose, 'id' | 'fallId' | 'herkunft'>,
    id: string = neueId('diag'),
  ): Vorgang {
    return {
      name: 'diagnoseAnlegen',
      beschreibung: `Diagnose ${diagnose.code} dokumentiert`,
      anwenden: (z) => {
        const fall = fallFuer(z, diagnose.patientId);
        const neue: Diagnose = {
          ...diagnose,
          id,
          fallId: fall.id,
          herkunft: {
            bestand: 'lokal',
            quelle: 'Hausarztpraxis am Stadtgarten',
            zeitpunkt: jetzt(z),
            verantwortlich: z.nutzer.name,
            dokumentId: null,
          },
        };
        /**
         * Es wird bewusst kein Karteitext mitgeschrieben. Der Verlaufseintrag entsteht
         * aus der Diagnose selbst (`verlaufBilden`) und bleibt damit richtig, wenn die
         * Diagnose später geändert wird. Eine mitgeschriebene Textfassung wäre eine
         * zweite Wahrheit, die beim ersten Ändern veraltet.
         */
        return { ...mitFall(z, fall), diagnosen: [neue, ...z.diagnosen] };
      },
    };
  },

  /** Ändert eine bestehende Diagnose. Die Felder folgen dem Informationsmodell. */
  diagnoseAendern(diagnoseId: string, aenderung: Partial<Diagnose>): Vorgang {
    return {
      name: 'diagnoseAendern',
      beschreibung: 'Diagnose geändert',
      anwenden: (z) => ({
        ...z,
        diagnosen: z.diagnosen.map((d) =>
          d.id === diagnoseId
            ? {
                ...d,
                ...aenderung,
                // Die Änderung übernimmt die Verantwortung: Herkunft wird fortgeschrieben.
                herkunft: {
                  ...d.herkunft,
                  bestand: 'lokal',
                  quelle: 'Hausarztpraxis am Stadtgarten',
                  zeitpunkt: jetzt(z),
                  verantwortlich: z.nutzer.name,
                },
              }
            : d,
        ),
      }),
    };
  },

  /** Ändert eine bestehende Allergie. */
  allergieAendern(allergieId: string, aenderung: Partial<Allergie>): Vorgang {
    return {
      name: 'allergieAendern',
      beschreibung: 'Allergie geändert',
      anwenden: (z) => ({
        ...z,
        allergien: z.allergien.map((a) =>
          a.id === allergieId
            ? {
                ...a,
                ...aenderung,
                herkunft: {
                  ...a.herkunft,
                  bestand: 'lokal',
                  quelle: 'Hausarztpraxis am Stadtgarten',
                  zeitpunkt: jetzt(z),
                  verantwortlich: z.nutzer.name,
                },
              }
            : a,
        ),
      }),
    };
  },

  /** Hält fest, dass der Medikationsplan mit der ePA abgeglichen wurde. */
  medikationAbgeglichen(spiegel: Medikationsspiegel): Vorgang {
    return {
      name: 'medikationAbgeglichen',
      beschreibung: 'Medikationsplan mit der ePA abgeglichen',
      // Ein Abgleich ist keine fachliche Handlung, sondern eine technische Folge.
      zaehltNicht: true,
      anwenden: (z) => ({
        ...z,
        medikationsspiegel: [
          spiegel,
          ...z.medikationsspiegel.filter((s) => s.patientId !== spiegel.patientId),
        ],
      }),
    };
  },

  /** Setzt eine Diagnose auf „Behoben" und schließt den klinisch relevanten Zeitraum. */
  diagnoseAbschliessen(diagnoseId: string): Vorgang {
    return {
      name: 'diagnoseAbschliessen',
      beschreibung: 'Diagnose als behoben dokumentiert',
      anwenden: (z) => ({
        ...z,
        diagnosen: z.diagnosen.map((d) =>
          d.id === diagnoseId ? { ...d, klinischerStatus: 'behoben', ende: z.heute } : d,
        ),
      }),
    };
  },

  allergieAnlegen(
    allergie: Omit<Allergie, 'id' | 'herkunft'>,
    id: string = neueId('allg'),
  ): Vorgang {
    return {
      name: 'allergieAnlegen',
      beschreibung: `Allergie ${allergie.substanz} dokumentiert`,
      anwenden: (z) => {
        const neue: Allergie = {
          ...allergie,
          id,
          herkunft: {
            bestand: 'lokal',
            quelle: 'Hausarztpraxis am Stadtgarten',
            zeitpunkt: jetzt(z),
            verantwortlich: z.nutzer.name,
            dokumentId: null,
          },
        };
        return { ...z, allergien: [neue, ...z.allergien] };
      },
    };
  },

  /* ---------- Befugnis (ADR 0017) ---------- */

  befugnisErhalten(patientId: string, gueltigBis: string, erteiltAm: string): Vorgang {
    return {
      name: 'befugnisErhalten',
      beschreibung: 'ePA-Befugnis nach Einlesen der eGK erhalten',
      zaehltNicht: true,
      anwenden: (z) => ({
        ...z,
        epaBefugnisse: [
          { patientId, gueltigBis, erteiltAm },
          ...z.epaBefugnisse.filter((b) => b.patientId !== patientId),
        ],
      }),
    };
  },

  befugnisVerloren(patientId: string): Vorgang {
    return {
      name: 'befugnisVerloren',
      beschreibung: 'ePA meldet: keine gültige Befugnis',
      zaehltNicht: true,
      anwenden: (z) =>
        z.epaBefugnisse.some((b) => b.patientId === patientId)
          ? { ...z, epaBefugnisse: z.epaBefugnisse.filter((b) => b.patientId !== patientId) }
          : z,
    };
  },

  /* ---------- Listen der ePA (✦ Diagnose-Service, ADR 0018) ---------- */

  /**
   * Verknüpft einen lokalen Eintrag mit dem Eintrag der ePA-Liste und merkt die Fassung.
   * Als Folge des Speicherns (Kästchen in der Maske) zählt das nicht als eigene Handlung.
   */
  listeneintragVerknuepfen(
    art: 'diagnose' | 'allergie',
    id: string,
    epaId: string | null,
    epaFassung: string | null,
    alsFolge = false,
  ): Vorgang {
    return {
      name: 'listeneintragVerknuepfen',
      zaehltNicht: alsFolge,
      beschreibung: epaId
        ? `${art === 'diagnose' ? 'Diagnose' : 'Allergie'} mit der ePA-Liste abgeglichen`
        : `Verknüpfung mit der ePA-Liste gelöst`,
      anwenden: (z) =>
        art === 'diagnose'
          ? {
              ...z,
              diagnosen: z.diagnosen.map((d) => (d.id === id ? { ...d, epaId, epaFassung } : d)),
            }
          : {
              ...z,
              allergien: z.allergien.map((a) => (a.id === id ? { ...a, epaId, epaFassung } : a)),
            },
    };
  },

  /**
   * Übernimmt einen Eintrag der Diagnosenliste der ePA in die Praxis — verknüpft. Die Herkunft
   * nennt die Liste und, falls vorhanden, das Quelldokument des Eintrags.
   */
  diagnoseAusEpaUebernehmen(patientId: string, epa: Diagnose, quelle: string): Vorgang {
    return {
      name: 'diagnoseAusEpaUebernehmen',
      beschreibung: `Diagnose ${epa.code || epa.bezeichnung} aus der ePA übernommen`,
      anwenden: (z) => {
        const fall = fallFuer(z, patientId);
        const neue: Diagnose = {
          ...epa,
          id: neueId('diag'),
          patientId,
          fallId: fall.id,
          herkunft: {
            bestand: 'epa',
            quelle,
            zeitpunkt: jetzt(z),
            verantwortlich: z.nutzer.name,
            dokumentId: epa.herkunft.dokumentId,
          },
        };
        return { ...mitFall(z, fall), diagnosen: [neue, ...z.diagnosen] };
      },
    };
  },

  allergieAusEpaUebernehmen(patientId: string, epa: Allergie, quelle: string): Vorgang {
    return {
      name: 'allergieAusEpaUebernehmen',
      beschreibung: `Allergie ${epa.substanz} aus der ePA übernommen`,
      anwenden: (z) => {
        const neue: Allergie = {
          ...epa,
          id: neueId('allg'),
          patientId,
          herkunft: {
            bestand: 'epa',
            quelle,
            zeitpunkt: jetzt(z),
            verantwortlich: z.nutzer.name,
            dokumentId: epa.herkunft.dokumentId,
          },
        };
        return { ...z, allergien: [neue, ...z.allergien] };
      },
    };
  },

  /**
   * Übernimmt den Stand der ePA in einen verknüpften lokalen Eintrag. Die ICD-10-GM mit
   * Zusatzkennzeichen und Seite bleibt die der Praxis — sie dient ihrer Abrechnung.
   */
  diagnoseNachEpaAngleichen(diagnoseId: string, epa: Diagnose): Vorgang {
    return {
      name: 'diagnoseNachEpaAngleichen',
      beschreibung: 'Diagnose auf den Stand der ePA gebracht',
      anwenden: (z) => ({
        ...z,
        diagnosen: z.diagnosen.map((d) =>
          d.id === diagnoseId
            ? {
                ...epa,
                id: d.id,
                patientId: d.patientId,
                fallId: d.fallId,
                herkunft: d.herkunft,
                code: d.code,
                bezeichnung: d.bezeichnung,
                zusatzkennzeichen: d.zusatzkennzeichen,
                seitenlokalisation: d.seitenlokalisation,
              }
            : d,
        ),
      }),
    };
  },

  allergieNachEpaAngleichen(allergieId: string, epa: Allergie): Vorgang {
    return {
      name: 'allergieNachEpaAngleichen',
      beschreibung: 'Allergie auf den Stand der ePA gebracht',
      anwenden: (z) => ({
        ...z,
        allergien: z.allergien.map((a) =>
          a.id === allergieId
            ? { ...epa, id: a.id, patientId: a.patientId, herkunft: a.herkunft }
            : a,
        ),
      }),
    };
  },

  leistungErfassen(patientId: string, ziffer: string, bezeichnung: string): Vorgang {
    return {
      name: 'leistungErfassen',
      beschreibung: `Ziffer ${ziffer} erfasst`,
      anwenden: (z) => {
        const fall = fallFuer(z, patientId);
        const neue: Leistungsziffer = {
          id: neueId('leist'),
          patientId,
          fallId: fall.id,
          ziffer,
          bezeichnung,
          datum: z.heute,
          anzahl: 1,
          erfasstVon: z.nutzer.name,
        };
        return { ...mitFall(z, fall), leistungen: [neue, ...z.leistungen] };
      },
    };
  },

  leistungEntfernen(leistungId: string): Vorgang {
    return {
      name: 'leistungEntfernen',
      beschreibung: 'Ziffer entfernt',
      anwenden: (z) => ({ ...z, leistungen: z.leistungen.filter((l) => l.id !== leistungId) }),
    };
  },

  terminstatusSetzen(terminId: string, status: Terminstatus): Vorgang {
    return {
      name: 'terminstatusSetzen',
      beschreibung: `Terminstatus auf „${status}" gesetzt`,
      anwenden: (z) => ({
        ...z,
        termine: z.termine.map((t) => (t.id === terminId ? { ...t, status } : t)),
      }),
    };
  },

  karteEinlesen(patientId: string): Vorgang {
    return {
      name: 'karteEinlesen',
      beschreibung: 'Gesundheitskarte eingelesen',
      anwenden: (z) => ({
        ...z,
        patienten: z.patienten.map((p) =>
          p.id === patientId
            ? { ...p, versicherung: { ...p.versicherung, zuletztEingelesen: jetzt(z) } }
            : p,
        ),
      }),
    };
  },

  /** Übernimmt ein Dokument aus der ePA in die lokale Ablage. */
  dokumentUebernehmen(
    patientId: string,
    angabe: {
      epaId: string;
      titel: string;
      art: Dokumentart;
      datum: string;
      einrichtung: string;
      autor: string;
      inhalt: unknown;
      /** MIME-Typ laut Dokumentverweis; ohne Angabe FHIR-JSON. */
      inhaltstyp?: string;
    },
  ): Vorgang {
    return {
      name: 'dokumentUebernehmen',
      beschreibung: `Dokument „${angabe.titel}" aus der ePA übernommen`,
      anwenden: (z) => {
        if (z.dokumente.some((d) => d.patientId === patientId && d.epaId === angabe.epaId))
          return z;
        const inhaltstext = JSON.stringify(angabe.inhalt ?? {});
        const neu: LokalesDokument = {
          id: neueId('dok'),
          patientId,
          titel: angabe.titel,
          art: angabe.art,
          ursprung: 'akte',
          datum: angabe.datum,
          epaId: angabe.epaId,
          einrichtung: angabe.einrichtung,
          autor: angabe.autor,
          dateiname: `${angabe.epaId}.${(angabe.inhaltstyp ?? 'application/fhir+json').endsWith('xml') ? 'xml' : 'json'}`,
          inhaltstyp: angabe.inhaltstyp ?? 'application/fhir+json',
          groesseBytes: new TextEncoder().encode(inhaltstext).length,
          gespeichertAm: jetzt(z),
          gespeichertVon: z.nutzer.name,
          inhalt: angabe.inhalt,
          notiz: null,
        };
        return { ...z, dokumente: [neu, ...z.dokumente] };
      },
    };
  },

  /** Legt eine eingescannte Unterlage in der lokalen Ablage ab. */
  dokumentEinscannen(
    patientId: string,
    angabe: { titel: string; art: Dokumentart; datum: string; notiz: string | null },
  ): Vorgang {
    return {
      name: 'dokumentEinscannen',
      beschreibung: `Dokument „${angabe.titel}" eingescannt`,
      anwenden: (z) => {
        const neu: LokalesDokument = {
          id: neueId('dok'),
          patientId,
          titel: angabe.titel,
          art: angabe.art,
          ursprung: 'praxis',
          datum: angabe.datum,
          epaId: null,
          einrichtung: 'Hausarztpraxis am Stadtgarten',
          autor: z.nutzer.name,
          dateiname: `${angabe.titel.toLowerCase().replace(/\W+/g, '-')}.pdf`,
          inhaltstyp: 'application/pdf',
          // Die Demo legt beim Einscannen keine Bilddaten an — also auch keine erfundene Größe.
          groesseBytes: 0,
          gespeichertAm: jetzt(z),
          gespeichertVon: z.nutzer.name,
          inhalt: null,
          notiz: angabe.notiz,
        };
        return { ...z, dokumente: [neu, ...z.dokumente] };
      },
    };
  },

  /** Vermerkt, dass ein lokales Dokument in die ePA eingestellt wurde. */
  dokumentEingestellt(dokumentId: string, epaId: string): Vorgang {
    return {
      name: 'dokumentEingestellt',
      beschreibung: 'Dokument in die ePA eingestellt',
      anwenden: (z) => ({
        ...z,
        dokumente: z.dokumente.map((d) => (d.id === dokumentId ? { ...d, epaId } : d)),
      }),
    };
  },

  dokumentEntfernen(dokumentId: string): Vorgang {
    return {
      name: 'dokumentEntfernen',
      beschreibung: 'Dokument aus der lokalen Ablage entfernt',
      anwenden: (z) => ({ ...z, dokumente: z.dokumente.filter((d) => d.id !== dokumentId) }),
    };
  },

  /** Legt ein E-Rezept an — vorbereitet, noch nicht signiert. */
  rezeptVorbereiten(
    angabe: Pick<
      Rezept,
      'patientId' | 'arzneimittel' | 'dosierung' | 'packungen' | 'normgroesse' | 'empId' | 'grund'
    > & { freigabe?: Rezeptfreigabe; hinweis?: string | null },
    id: string = neueId('rezept'),
  ): Vorgang {
    return {
      name: 'rezeptVorbereiten',
      beschreibung: `E-Rezept vorbereitet: ${angabe.arzneimittel.bezeichnung}`,
      anwenden: (z) => ({
        ...z,
        rezepte: [
          ...z.rezepte,
          {
            ...angabe,
            id,
            status: 'vorbereitet',
            freigabe: angabe.freigabe ?? 'freigegeben',
            hinweis: angabe.hinweis ?? null,
            erstelltAm: jetzt(z),
            vorbereitetVon: z.nutzer.name,
            rezeptId: null,
            accessCode: null,
            signiertVon: null,
            gesendetAm: null,
            geloeschtAm: null,
          },
        ],
      }),
    };
  },

  rezeptFreigabeSetzen(id: string, freigabe: Rezeptfreigabe, hinweis: string | null): Vorgang {
    return {
      name: 'rezeptFreigabeSetzen',
      beschreibung: 'Freigabe des E-Rezepts geändert',
      anwenden: (z) => ({
        ...z,
        rezepte: z.rezepte.map((r) => (r.id === id ? { ...r, freigabe, hinweis } : r)),
      }),
    };
  },

  /** Signiert und im E-Rezept-Fachdienst aktiviert. */
  rezeptGesendet(id: string, rezeptId: string, accessCode: string): Vorgang {
    return {
      name: 'rezeptGesendet',
      beschreibung: `E-Rezept ${rezeptId} signiert und gesendet`,
      anwenden: (z) => ({
        ...z,
        rezepte: z.rezepte.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'gesendet',
                rezeptId,
                accessCode,
                signiertVon: z.nutzer.name,
                gesendetAm: jetzt(z),
              }
            : r,
        ),
      }),
    };
  },

  rezeptGeloescht(id: string): Vorgang {
    return {
      name: 'rezeptGeloescht',
      beschreibung: 'E-Rezept im Fachdienst gelöscht',
      anwenden: (z) => ({
        ...z,
        rezepte: z.rezepte.map((r) =>
          r.id === id ? { ...r, status: 'geloescht', geloeschtAm: jetzt(z) } : r,
        ),
      }),
    };
  },

  /** Verwirft ein nur vorbereitetes Rezept — es hat den Fachdienst nie erreicht. */
  rezeptVerwerfen(id: string): Vorgang {
    return {
      name: 'rezeptVerwerfen',
      beschreibung: 'Vorbereitetes E-Rezept verworfen',
      anwenden: (z) => ({
        ...z,
        rezepte: z.rezepte.filter((r) => !(r.id === id && r.status === 'vorbereitet')),
      }),
    };
  },

  /** Neue Impfung der Praxis. */
  impfungAnlegen(
    angabe: Omit<Impfung, 'id' | 'herkunft' | 'epaId' | 'status'>,
    id: string = neueId('impf'),
  ): Vorgang {
    return {
      name: 'impfungAnlegen',
      beschreibung: `Impfung dokumentiert: ${angabe.impfstoff.bezeichnung}`,
      anwenden: (z) => ({
        ...z,
        impfungen: [
          {
            ...angabe,
            id,
            status: 'erfolgt',
            epaId: null,
            herkunft: {
              bestand: 'lokal',
              quelle: 'Hausarztpraxis am Stadtgarten',
              zeitpunkt: jetzt(z),
              verantwortlich: z.nutzer.name,
              dokumentId: null,
            },
          },
          ...z.impfungen,
        ],
      }),
    };
  },

  /** Verknüpft eine Impfung der Praxis mit ihrem Eintrag in der Impfliste der ePA. */
  impfungVerknuepfen(id: string, epaId: string | null, alsFolge = false): Vorgang {
    return {
      name: 'impfungVerknuepfen',
      zaehltNicht: alsFolge,
      beschreibung: 'Impfung mit der Impfliste der ePA abgeglichen',
      anwenden: (z) => ({
        ...z,
        impfungen: z.impfungen.map((i) => (i.id === id ? { ...i, epaId } : i)),
      }),
    };
  },

  /** Übernimmt eine Impfung aus der Impfliste der ePA — verknüpft. */
  impfungAusEpaUebernehmen(patientId: string, epa: Impfung, quelle: string): Vorgang {
    return {
      name: 'impfungAusEpaUebernehmen',
      beschreibung: `Impfung ${epa.impfstoff.bezeichnung} aus der ePA übernommen`,
      anwenden: (z) => ({
        ...z,
        impfungen: [
          {
            ...epa,
            id: neueId('impf'),
            patientId,
            epaId: epa.id,
            herkunft: {
              bestand: 'epa',
              quelle,
              zeitpunkt: jetzt(z),
              verantwortlich: z.nutzer.name,
              dokumentId: epa.herkunft.dokumentId,
            },
          },
          ...z.impfungen,
        ],
      }),
    };
  },

  /** Merkt, was eine ePA-Sicht beim Aufruf gezeigt hat. Keine Handlung der Praxis. */
  /** Sortierung oder eigene Reihenfolge einer Liste — eine Ansicht, keine Handlung. */
  listenordnungSetzen(ordnung: Listenordnung): Vorgang {
    return {
      name: 'listenordnungSetzen',
      beschreibung: 'Reihenfolge der Liste geändert',
      zaehltNicht: true,
      anwenden: (z) => ({
        ...z,
        listenordnung: [
          ...z.listenordnung.filter(
            (o) => !(o.patientId === ordnung.patientId && o.liste === ordnung.liste),
          ),
          ordnung,
        ],
      }),
    };
  },

  epaLesezeichenMerken(lesezeichen: EpaLesezeichen): Vorgang {
    return {
      name: 'epaLesezeichenMerken',
      beschreibung: 'Lesezeichen der ePA-Abfrage gemerkt',
      zaehltNicht: true,
      anwenden: (z) => ({
        ...z,
        epaLesezeichen: [
          ...z.epaLesezeichen.filter(
            (l) => !(l.patientId === lesezeichen.patientId && l.bestand === lesezeichen.bestand),
          ),
          lesezeichen,
        ],
      }),
    };
  },

  epaGesehenMerken(stand: EpaGesehen): Vorgang {
    return {
      name: 'epaGesehenMerken',
      beschreibung: 'Stand der ePA-Sicht gemerkt',
      zaehltNicht: true,
      anwenden: (z) => ({
        ...z,
        epaGesehen: [
          ...z.epaGesehen.filter(
            (g) => !(g.patientId === stand.patientId && g.sicht === stand.sicht),
          ),
          stand,
        ],
      }),
    };
  },

  stammdatenAendern(patientId: string, aenderung: Partial<Patient>): Vorgang {
    return {
      name: 'stammdatenAendern',
      beschreibung: 'Stammdaten geändert',
      anwenden: (z) => ({
        ...z,
        patienten: z.patienten.map((p) => (p.id === patientId ? { ...p, ...aenderung } : p)),
      }),
    };
  },
} as const;

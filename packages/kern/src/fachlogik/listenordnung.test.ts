import { describe, expect, it } from 'vitest';
import { ordnen, reihenfolgeAus, verschieben, type Ordnungsangaben } from './listenordnung.js';

const e = (kennung: string, eingestelltAm: string, beginn: string, bezeichnung: string) => ({
  kennungen: [kennung],
  eingestelltAm,
  beginn,
  bezeichnung,
});
const a = e('a', '2026-07-17', '2019-01-01', 'Vorhofflimmern');
const b = e('b', '2026-09-09', '2026-09-01', 'Akute Bronchitis');
const c = e('c', '2024-03-11', '2024-03-11', 'Hypertonie');
const alle = [a, b, c];
const id = (x: Ordnungsangaben) => x;
const namen = (xs: Ordnungsangaben[]) => xs.map((x) => x.kennungen[0]);

describe('Listenordnung', () => {
  it('ordnet voreingestellt nach Einstellung, die jüngste zuerst', () => {
    expect(namen(ordnen(alle, id, 'eingestellt-neu'))).toEqual(['b', 'a', 'c']);
    expect(namen(ordnen(alle, id, 'eingestellt-alt'))).toEqual(['c', 'a', 'b']);
  });

  it('ordnet nach Beginn und nach Bezeichnung', () => {
    expect(namen(ordnen(alle, id, 'beginn'))).toEqual(['b', 'c', 'a']);
    expect(namen(ordnen(alle, id, 'bezeichnung'))).toEqual(['b', 'c', 'a']);
  });

  it('folgt der eigenen Reihenfolge und stellt Unbekanntes nach oben', () => {
    expect(namen(ordnen(alle, id, 'eigene', ['c', 'a']))).toEqual(['b', 'c', 'a']);
  });

  it('erkennt einen Eintrag unter jeder seiner Kennungen — auch nach dem Einstellen in die ePA', () => {
    const verknuepft = { ...a, kennungen: ['lokal-a', 'epa-a'] };
    expect(namen(ordnen([verknuepft, c], id, 'eigene', ['c', 'epa-a']))).toEqual(['c', 'lokal-a']);
  });

  it('verschiebt und merkt die Reihenfolge', () => {
    const neu = verschieben(ordnen(alle, id, 'eingestellt-neu'), 0, 2);
    expect(reihenfolgeAus(neu, id)).toEqual(['a', 'c', 'b']);
    expect(verschieben(alle, 0, 5)).toEqual(alle);
  });
});

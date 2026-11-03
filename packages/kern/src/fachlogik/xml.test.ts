import { describe, expect, it } from 'vitest';
import { kind, xmlLesen } from './xml.js';

describe('XML-Leser', () => {
  it('liest Elemente, Attribute, Text, CDATA und die fünf vordefinierten Entitäten', () => {
    const e = xmlLesen(
      '<?xml version="1.0"?><a:wurzel x="1 &amp; 2"><b>Text &lt;3</b><c><![CDATA[<roh>]]></c></a:wurzel>',
    );
    expect(e.lokal).toBe('wurzel');
    expect(e.attribute['x']).toBe('1 & 2');
    expect(kind(e, 'b')?.text).toBe('Text <3');
    expect(kind(e, 'c')?.text).toBe('<roh>');
  });

  it('bricht ab, statt Unpassendes zu übergehen', () => {
    expect(() => xmlLesen('<a><b c=1>x</b></a>')).toThrow(/nicht wohlgeformt/);
    expect(() => xmlLesen('<a>&eigen;</a>')).toThrow(/unbekannte Entität/);
    expect(() => xmlLesen('<a/>Text danach')).toThrow(/nicht wohlgeformt/);
    expect(() => xmlLesen('<a/><b/>')).toThrow(/mehr als ein Wurzelelement/);
    expect(() => xmlLesen('<a><b></a>')).toThrow(/nicht wohlgeformt/);
  });
});

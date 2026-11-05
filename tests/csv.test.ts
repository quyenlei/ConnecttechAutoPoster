import { describe, expect, it } from 'vitest';
import { csvCell, logsToCsv } from '../src/lib/csv';

describe('csv', () => {
  it('escapes quotes and neutralizes formulas', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
  });
  it('writes a header and rows', () => {
    const csv = logsToCsv([
      { id: '1', ts: 0, campaignId: 'c', groupId: 'g', groupName: 'G', status: 'posted', message: 'ok' },
    ]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('1970-01-01T00:00:00.000Z');
  });
});

import {
  formatLocation,
  getCitiesForState,
  indianLocations,
  parseLocation,
} from '../src/lib/location-options';

describe('Indian location options', () => {
  it('covers every state and union territory exactly once', () => {
    const names = indianLocations.map(item => item.state);
    expect(names).toHaveLength(36);
    expect(new Set(names).size).toBe(names.length);
    expect(indianLocations.every(item => item.cities.length > 0)).toBe(true);
  });

  it('keeps city choices scoped to the selected state', () => {
    expect(getCitiesForState('Rajasthan')).toContain('Jaipur');
    expect(getCitiesForState('Karnataka')).toContain('Bengaluru');
    expect(getCitiesForState('Unknown')).toEqual([]);
  });

  it('formats and parses saved profile locations', () => {
    expect(formatLocation(' Jaipur, ', 'Rajasthan')).toBe('Jaipur, Rajasthan');
    expect(parseLocation('Bengaluru, Karnataka')).toEqual({
      city: 'Bengaluru',
      state: 'Karnataka',
    });
    expect(parseLocation('Jaipur')).toEqual({city: 'Jaipur', state: 'Rajasthan'});
  });
});

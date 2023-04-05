import { sampleMethod } from './sample';

describe('sample Method', () => {
  it('should return 4', () => {
    expect.assertions(1);
    expect(sampleMethod()).toBe(4);
  });
});
